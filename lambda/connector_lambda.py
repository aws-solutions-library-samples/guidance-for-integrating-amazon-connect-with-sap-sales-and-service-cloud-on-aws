import requests
import time
import json
import boto3
from requests.auth import HTTPBasicAuth
from botocore.exceptions import ClientError
from urllib.parse import urljoin, urlparse
from requests.exceptions import RequestException
import os
import re

def lambda_handler(event, context):
    
    print(event)
    global BASE_URL
    global PHONE_SERVICE_ENDPOINT_PATH
    global PHONE_CALL_ENDPOINT_PATH
    global USERNAME
    global PASSWORD
    global BUCKET_NAME
    global ANALYSIS_TYPE

    ## Handle the parameters
    # The root parameter of parameter store ex: SAP-C4C-connect-poc
    ROOT_NAME_PARAM = os.environ['SSM_PARAM_ROOT_NAME']
    
    # The environment can be any, default is 'poc'
    ENVIRONMENT = os.environ['ENVIRONMENT_NAME']
    
    # Get the parameter names for C4C - ex: https://XXXX.demo.crm.cloud.sap
    BASE_URL_PARAM = os.environ['SSM_PARAM_C4C_BASE_URL']
    
    # ex: /sap/c4c/api/v1/phone-service/
    PHONE_SERVICE_ENDPOINT_PATH_PARAM = os.environ['SSM_PARAM_C4C_PHONE_SERVICE_ENDPOINT_PATH']
    
    USERNAME_PARAM = os.environ['SSM_PARAM_C4C_USERNAME']
    PASSWORD_PARAM = os.environ['SECRET_PARAM_C4C_PASSWORD']
    
    # Bucket name - ex: amazon-connect-XXX
    BUCKE_NAME_PARAM = os.environ['SSM_PARAM_BUCKET_NAME']

    # Build the SSM parameter prefix, ex:/SAP-C4C-connect-poc/poc
    SSM_PARAM_PREFIX = f"/{ROOT_NAME_PARAM}/{ENVIRONMENT}/"

    try:
    
        # Get the C4C parameters from SSM and SecretsManager
        ssm = boto3.client('ssm')
        secrets_manager = boto3.client('secretsmanager')

        # ensure BASE_URL and PHONE_SERVICE_ENDPOINT_PATH have a trailing space - ex: https://XXXX.demo.crm.cloud.sap
        BASE_URL = ssm.get_parameter(Name=SSM_PARAM_PREFIX + BASE_URL_PARAM)['Parameter']['Value']
        # ex: https://XXXX.demo.crm.cloud.sap/
        BASE_URL = BASE_URL if urlparse(BASE_URL).path else BASE_URL + "/"
        
        # ex: /sap/c4c/api/v1/phone-service/
        PHONE_SERVICE_ENDPOINT_PATH = ssm.get_parameter(Name=SSM_PARAM_PREFIX + PHONE_SERVICE_ENDPOINT_PATH_PARAM)['Parameter']['Value']
        # ex: /sap/c4c/api/v1/phone-service/
        PHONE_SERVICE_ENDPOINT_PATH = PHONE_SERVICE_ENDPOINT_PATH if urlparse(PHONE_SERVICE_ENDPOINT_PATH).path else PHONE_SERVICE_ENDPOINT_PATH + "/"

        USERNAME = ssm.get_parameter(Name=SSM_PARAM_PREFIX + USERNAME_PARAM)['Parameter']['Value']
        PASSWORD = secrets_manager.get_secret_value(SecretId=PASSWORD_PARAM)['SecretString']

        # ex: amazon-connect-XXX
        BUCKET_NAME = ssm.get_parameter(Name=SSM_PARAM_PREFIX + BUCKE_NAME_PARAM)['Parameter']['Value']

        ruleName = event['detail']['ruleName']
        print(ruleName)

        if ruleName == "SAPPostCallAnalytics":
            PHONE_CALL_ENDPOINT_PATH = PHONE_SERVICE_ENDPOINT_PATH + "phoneCalls"
            ANALYSIS_TYPE = 'Voice'
        elif ruleName == "SAPPostChatAnalytics":
            PHONE_CALL_ENDPOINT_PATH = PHONE_SERVICE_ENDPOINT_PATH.replace("phone", "chat") + "chats"
            ANALYSIS_TYPE = 'Chat'
        else:
            raise ValueError(f"Unsupported ruleName: {ruleName}")

        print(BASE_URL)

        # Extract post contact summary and external ref ID from event
        post_contact_summary, external_reference_id = extract_summary_refID(event)

        # create auth object
        auth = create_auth()

        # Get the call record
        call_record = get_call_record(external_reference_id, auth)
        print(json.dumps(call_record))

        # Extract call details
        call_id, updated_on = extract_call_details(call_record)

        # Update call record
        updated_record = update_call_record(call_id, updated_on, post_contact_summary, auth)
        print(json.dumps(updated_record))

        return {
            'statusCode': 200,
            'body': json.dumps(updated_record)
        }
    except ValueError as e:
        print(f"Error: {e}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': str(e)})
        }
    except RequestException as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Error communicating with external service'})
        }
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Unexpected error occurred'})
        }


def create_auth():
    # Create the HTTPBasicAuth object
    auth = HTTPBasicAuth(USERNAME, PASSWORD)
    return auth

def extract_summary_refID(event):
    
    print("Event received:")
    print(json.dumps(event))
    
    timevalue = event['time']
    timevalue1 = getPreviousDay(timevalue)
    timevalue2 = getNextDay(timevalue)

    contact_arn = event['detail']['contactArn']
    external_reference_id = contact_arn.split("/")[-1]

    # Construct the key prefix for S3
    prefix = f'Analysis/{ANALYSIS_TYPE}/{timevalue[:4]}/{timevalue[5:7]}/{timevalue[8:10]}/{contact_arn.split("/")[-1]}_analysis_'
    prefixPreviousDay = f'Analysis/{ANALYSIS_TYPE}/{timevalue1[:4]}/{timevalue1[5:7]}/{timevalue1[8:10]}/{contact_arn.split("/")[-1]}_analysis_'
    prefixNextDay = f'Analysis/{ANALYSIS_TYPE}/{timevalue2[:4]}/{timevalue2[5:7]}/{timevalue2[8:10]}/{contact_arn.split("/")[-1]}_analysis_'
    print ('Processed prefix:', prefix)
    
    # Create an S3 resource
    s3 = boto3.resource('s3')
    bucket = s3.Bucket(BUCKET_NAME)

    try:
        # Find the first matching object in the bucket
        obj = next((obj for obj in bucket.objects.filter(Prefix=prefix)), None)
        if obj is None:
            # UTC time conversion bug and S3 bucket folder name, find in previous day folder           
            print ('Processed prefix-previous day:', prefixPreviousDay)
            obj = next((obj for obj in bucket.objects.filter(Prefix=prefixPreviousDay)), None)

            if obj is None:
                # UTC time conversion bug and S3 bucket folder name, find in next day folder                
                print ('Processed prefix - next day:', prefixNextDay)
                obj = next((obj for obj in bucket.objects.filter(Prefix=prefixNextDay)), None)
                if obj is None:
                    return {
                        'statusCode': 404,
                        'body': json.dumps({'message': 'No matching object found in S3'})
                    }   
            
        print ('Found Object with key:', obj.key)
       
        # Get the object content
        file_content = obj.get()['Body'].read().decode('utf-8')
        json_data = json.loads(file_content)
        
        #when post contact summary is empty retry 4 times in 30 sec interval; this happens due to bug in call transfer
        retry_count = 0
        while retry_count < 4 and not json_data.get("ConversationCharacteristics", {}).get("ContactSummary", {}).get("PostContactSummary", {}).get("Content", ""):
            retry_count += 1
            time.sleep(30) # nosemgrep 
        
        # Extract the "PostContactSummary" from the JSON data
        post_contact_summary = json_data.get("ConversationCharacteristics", {}).get("ContactSummary", {}).get("PostContactSummary", {}).get("Content", "")
        
        print('PostContactSummary:',post_contact_summary)
        print('ExternalReferenceID:', external_reference_id)
        
        return post_contact_summary, external_reference_id
        
    except ClientError as e:
        error_message = e.response['Error']['Message']
        return {
            'statusCode': e.response['ResponseMetadata']['HTTPStatusCode'],
            'body': json.dumps({'message': error_message})
        }

def getPreviousDay(timevalue):
    # Convert the time string to a timestamp
    timestamp = time.mktime(time.strptime(timevalue, "%Y-%m-%dT%H:%M:%SZ"))

    # Subtract 24 hours (86400 seconds) from the timestamp
    previous_day_timestamp = timestamp - 86400

    # Convert the timestamp back to a time string
    previous_day_timevalue = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(previous_day_timestamp))

    return previous_day_timevalue

def getNextDay(timevalue):
    # Convert the time string to a timestamp
    timestamp = time.mktime(time.strptime(timevalue, "%Y-%m-%dT%H:%M:%SZ"))

    # Add 24 hours (86400 seconds) to the timestamp
    next_day_timestamp = timestamp + 86400

    # Convert the timestamp back to a time string
    next_day_timevalue = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(next_day_timestamp))

    return next_day_timevalue


def get_call_record(external_reference_id, auth):
    try:
        url = urljoin(BASE_URL, PHONE_CALL_ENDPOINT_PATH)

        # Remove dashes in reference ID v1.1
        # displayFilter = f"externalId.displayId eq '{external_reference_id}'"
        clean_ref_id = str(external_reference_id).replace('-', '').upper()
        displayFilter = f"externalId.displayId eq '{clean_ref_id}'"
        #-#

        params = {'$filter': displayFilter}

        response = requests.get(url, auth=auth, params=params, timeout=120)
        response.raise_for_status()
        return response.json()
    except RequestException as e:
        print(f"Error fetching call record: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None

def extract_call_details(call_record):
    """
    Extract the interaction/call ID and the adminData.updatedOn value from the fetched call record.
    """
    print('call_record: ',call_record)
    try:
        call_id = call_record["value"][0]["id"]
        updated_on = call_record["value"][0]["adminData"]["updatedOn"]
        return call_id, updated_on
    except KeyError as e:
        print(f"Error extracting call details: {e}")
        return None, None

def update_call_record(call_id, updated_on, transcript_summary, auth):
    try:
        url = urljoin(BASE_URL, f'{PHONE_CALL_ENDPOINT_PATH}/{call_id}')
        headers = {"if-Match": updated_on}
        data = {"transcript": transcript_summary}
        response = requests.patch(url, headers=headers, json=data, auth=auth, timeout=120)
        response.raise_for_status()
        return response.json()
    except RequestException as e:
        print(f"Error updating call record: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None