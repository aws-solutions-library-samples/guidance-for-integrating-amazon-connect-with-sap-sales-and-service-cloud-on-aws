# Amazon Connect Integration with SAP Sales and Service Cloud - Manual Deployment 

This solution guide provides manual step by step instructions for Amazon Connect Integration with SAP Sales and Service Cloud. If you would like to use the CDK automated deployment approach see the CDK steps in <a href="../README.md?#cdk-deployment" target="_blank">ReadMe</a>.

Ensure you have all the <a href="../README.md?#prerequisites" target="_blank">prerequisites</a>.

*Note: Identify the region where you will be deploying the solution, prior to each resource creation, ensure you are operating and creating resources in the same identified region.* 

## Table of Contents
1. [Create the Amazon Connect Instance](#1-create-the-amazon-connect-instance)
    1. [Gather the Connect Instance S3 Bucket Name](#11-gather-the-connect-instance-s3-bucket-name)
    1. [Create an Amazon Connect Agent User](#12-create-an-amazon-connect-agent-user)
    1. [Load a Sample Contact Flow](#13-load-a-sample-contact-flow)
    1. [Claim and Associate an Amazon Connect Phone Number](#14-claim-and-associate-an-amazon-connect-phone-number)
    1. [Assign Outbound Caller ID to your Queue](#15-assign-outbound-caller-id-to-your-queue)
1. [Enabling Call Recording and Call Summarization](#2-enabling-call-recording-and-call-summarization)
    1. [Enabling Call Recording and Permission to View Contact Records](#21-enabling-call-recording)
    1. [Enable Contact Lens for Conversational Analytics](#22-enable-contact-lens-for-conversational-analytics)
    1. [Allow Users to See Contact Detail and Contact Summary](#23-allow-users-to-see-contact-detail-and-contact-summary)
    1. [Configure Contact Lens Rules](#24-configure-contact-lens-rules)
1. [Create Additional Components](#3-create-additional-components)
    1. [Setup AWS Systems Manager Parameters for AWS Lambda](#31-setup-aws-system-manager-parameters-for-aws-lambda)
    1. [Create AWS Lambda Function](#32-create-aws-lambda-function)
    1. [Setup Amazon EventBridge](#33-setup-amazon-eventbridge)
1. [Amazon Connect Connector Deployment](#4-amazon-connect-connector-deployment)
    1. [Setup S3 Bucket for Amazon Connect Connector](#41-setup-s3-bucket-for-amazon-connect-cti-connector)
    1. [Setup CloudFront for Amazon Connect Connector](#42-setup-cloudfront-for-the-amazon-connect-cti-adapter)
    1. [Add Approved Origins](#33-add-approved-origins)
1. [Validations](#5-validations)

# 1. Create the Amazon Connect Instance

Login to your AWS account as an admin user, you will now create an Amazon Connect instance. (If you already have Amazon Connect instance, you can use the guide and create the components not present in your environment). 

1. In a browser, navigate to the AWS Console page.
2. In the service search field, enter `Amazon Connect`.
4. Select **Amazon Connect** from the list of AWS services.
5. Select **Add an instance**.
6. In the Identity management section, select **Store users** in Amazon Connect.
    * Choose other methods like SAML if you would like to enable single sign on integration with you Identity Provider.
    * Follow the documentation in this [link](https://docs.aws.amazon.com/connect/latest/adminguide/configure-saml.html) and skip to step 12.
7. Provide a unique Amazon Connect instance alias in the Access URL field. Select **Next**.
9. In the Add administrator section, select **Specify an administrator**.
10. Complete the required fields for the administrator user. Make a note of admin UserName and Password to use later. Select **Next**.
12. In the Telephony Options section, leave the defaults. Select **Next**.
12. In the Data Storage section, leave the defaults. Select **Next**.
15. Select **Create instance**.
16. Once your Amazon Connect instance is created, click on the instance alias of the newly created instance to go to the instance configuration screen. 
17. Copy the Access URL, Instance ARN, and Directory (Instance name) values and save them. You'll use these values later.
18. From the Instance ARN copy the text after the forward slash (/). This is the **Instance Id** value and will be used later.

## 1.1 Gather the Connect Instance S3 Bucket Name

1. In AWS Console -> Amazon Connect's instance configuration screen
2. Select **Data storage** on the left side of the page.
3. In the Call recordings section, copy the S3 bucket value up to, but not including, the first forward slash (/). This is the Storage S3 Bucket Name value and will be used later.

## 1.2 Create an Amazon Connect Agent User
1. In a new browser tab, navigate to the Amazon Connect Access URL you gathered previously.
2. Login with the Amazon Connect admin user credentials you configured previously, you are now logged in to the **Amazon Connect Dashboard**.
3. On the left navigation, select **Users** > **User management**.
4. Select **Add new users**.
5. In the User information section, make sure to provide values for: First name, Last name, Login, Email address, Password. Save agent Login and Password values for future steps.
6. In the Settings section, configure settings as shown below:
    * Security profile: Agent
    * Routing profile: Basic Routing Profile
7. Select **Save**

## 1.3 Load a sample Contact Flow

1. Right-click on this link <[SampleFlow](../contact-flow/1-MainFlow-Manual.json)> to select **Save as** to download the SAP Service Cloud/Amazon Connect sample flow.
2. In Amazon Connect Dashboard, select **Routing** -> **Flows**, select **Create Flow**.
3. Select the down arrow next to the Save button and select **Import (beta)**.
4. Choose the Contact Flow JSON file you downloaded.
5. Find the **Set working queue** block and edit the block, select the dropdown **Search for queue** and select **BasicQueue**.
6. Save and Publish the Contact Flow.
7. Inspect the Contact Flow for **Set Contact Attributes** blocks through out, the following contact attributes are used in the integration.
   * `Channel`, `VOICE` or `CHAT`
   * `ANI`, phone number
   * `CustomerUUID`, optional custom field
   * `TicketID`, optional custom field
   * `Serial`, optional custom field

## 1.4 Claim and Associate an Amazon Connect Phone Number

In this section you will claim a Amazon Connect phone number for the customer to call and reach an agent.

1. Go to Amazon Connect Dashboard, from the left side navigation select **Channels** > **Phone numbers**.
4. Select **Claim a number**.
5. In the **Choose channel** section, select **Voice**.
6. Select the **DID** (Direct Inward Dialing) tab.
7. Select the **country** for which to provision the phone number.
8. Enter an optional prefix if you wish to see a list of available numbers for a particular prefix.
9. Select a phone number from the list of available phone numbers.
10. In the Contact flow / IVR section, select the imported flow, the example is called `1-MainFlow`.
10. Save the Amazon Connect Phone number for later use. 
11. Select **Save**.

## 1.5 Assign Outbound Caller ID to your Queue

In order for outbound call to work, assign your claim phone number to the default queue in Routing Profile

1. In the Amazon Connect Dashboard, from the left navigation,select **Routing** -> **Queues**.
2. Select **BasicQueue**.
3. Select the dropdown for **Outbound caller ID number**, select the phone number you want as the caller id.
4. Select **Save**.


# 2. Enabling Call Recording and Call Summarization

Ensure the following configurations are enabled to have Amazon Connect Contact Lens integration with SAP Service Cloud to embed the link to Contact Record in Connect and Call Summarization.

## 2.1 Enabling Call Recording

1. In AWS Console, search and select **Amazon Connect**.
2. Select your Amazon Connect instance.
3. Select **Data Storage** on left and ensure **Call recordings** is enabled with a S3 bucket.

## 2.2 Enable Contact Lens for Conversational Analytics

1. In the Amazon Connect Console, for your Connect instance, select **Analytics tools** under Applications on the left.
2. Enable **Contact Lens** if it is not already enabled.

-----

*Note: In the sample Contact Flow,Contact Recording, Conversation Analysis, Post-Contact Summary are endabled. They are not required for the core CTI integration to work.*

-----

*Note: If you are using your own Contact Flow, the following features can be turned on in the **Set recording and analytics behavior** with this CTI integrations*
* ***Contact Lens speech analytics**, this is used for contact summarization.  Ensure you are recording both agent and customer, you can choose post-call analytics only or both real-time and post-call analytics.*
* ***Post-contact summary**, this is under Contact Lens Generative AI capabilities to summarize the entire interaction in a few sentences.*

## 2.3 Allow Users to see Contact Detail and Contact Summary

To allow users to see contact summary within Amazon Connect when the call ends, and to allow users to view contact detail, below permissions are set in Amazon Connect Agent Security Profile.

1. In the Amazon Connect Dashboard, from the left navigation,select **Users**->**Security Profiles**
2. Click on Agent
3. Make the below selections:
   * Contact Control Panel (CCP) section - Select
      * Contact Lens data
   * Analytics and Optimization section - Select **View** for below:
      * View my contacts
      * Contact Lens - conversational analytics 	
      * Contact Lens - post-contact summary
      * Recorded conversations (unredacted) (select **Access**)

## 2.4 Configure Contact Lens Rules 

1. Go to your Amazon Connect Dashboard, from the left navigation, select **Analytics and Optimization** -> **Rules**
3. Select **Create a rule**, select **Conversational analytics**
4. Under the **When** dropdown, choose **Contact Lens post-call analysis is available**
5. Select `**Any** conditions are met`. Add any condition that will meet your requirements, example: add condition, select **Queues**, `match **Any** of the following **BasicQueue**`.  Select **Next**.
6. Give the rule a name like **SAPPostCallAnalytics** which you will later use. Select **Add action**, and select **Generate an EventBridge event**, enter **SAPPostCallAnalytics** as the Action name.
7. Select **Next**, then **Save and publish**.

# 3. Create Additional Components
## 3.1 Setup AWS System Manager parameters for AWS Lambda

1. In AWS Console, search for AWS Systems Manager
2. Select **Parameter Store** on the left hand side under **Appication Tools**
3. Select **Create parameter** for each of the below and create 4 parameters. 

|Name|Type|Data Type|Value (Examples)|Comments|
|--------|--------|--------|--------|--------|
|/SAP-C4C-connect-poc/poc/connect-bucket-name|String|text|`amazon-connect-XXX`|S3 Bucket Name you saved earlier|
|/SAP-C4C-connect-poc/poc/c4c-base-url|String|text|`https://XXXX.demo.crm.cloud.sap`|SAP phone service base URL for you tenant|
|/SAP-C4C-connect-poc/poc/c4c-phone-service-endpoint-path|String|text|`/sap/c4c/api/v1/phone-service/`|SAP Phone Service path|
|/SAP-C4C-connect-poc/poc/c4c-username|String|text|`UserName`|SAP Rest API Username that is used when calling SAP API|

4. The password for the SAP Rest API will be stored in Secrets Manager. In AWS Secrets Manager Console, click on `Store a new secret`

     * For **Secret Type** choose **Other type of secret**
     * In **Secret value** choose **Plaintext** and provide the password for the SAP Rest API, example: `samplepassword`
     * **Encryption Key** leave default as `aws/secretsmanager`; click **Next**
     * **Secret name** provide `Secret-c4c-password`, click **Next**
     * **Configure rotaion** leave defaults, click **Next**
     * Click **Store** on the final step.
     * Click on the newly created secret and save the Secret ARN, you will use this in future steps.

## 3.2 Create AWS Lambda Function 

1. Create Lambda Layer
   1. In AWS Console, search and select AWS Lambda.
   2. Select **Layers** located on the left menu under **Additional resources**.
   3. Select **Create Layer**, in **Name**, enter `poc_lambda_layer`.
   4. Select **Upload** to upload [this zip file](lambda/manual/lambda_layer.zip)
   7. Select **x86_64** as the architecture.
   8. Select **Python 3.13** as the compatible runtime.
   9. Select **Create** to create the AWS Lambda layer.
2. Create Lambda Function
   1. In AWS Lambda Console, select **Functions** on left under **Lambda**
   11. Select **Create function**
       * Leave default option **Author from scratch** 
       * **Function name**, `poc-lambda-process-contact-lens-event`
       * **Runtime**, `Python 3.13`
       * Default for the rest.
       * Select **Create**
       * Replace the code with source code from here [lambda code](../lambda/connector_lambda.py)
   12. Select **Deploy**
   13. Select **Add a layer** at the bottom
   14. Select **Custom layers**
   15. Select `poc_lambda_layer` you created earlier and the latest version.
   16. Select **Add**
   17. Change the timeout to 15 mins in `Configuration` -> `General configuration`
    19. Download [inline policy](../lambda/manual/lambda_inline_policy.json). Edit the downloaded policy and replace `<S3 Bucket Name>` with the value of Amazon Connect bucket name saved earlier (in two places). Replace `<ARN of Secrets Manager Secret entry>` with the value saved earlier. 
   19. In the Lambda function, select **Permissions** on left, select the **Role name** to launch this role in a new tab.
   19. Under **Add Permission** select **Create Inline Policy**. Select JSON. 
   19. In the JSON editor, replace the JSON with the `updated - inline policy` file content from earlier step. Click Next and provide a name to the policy. Click **Create Policy**. You can close the role tab.
   20. In the Lambda function, Select **Configuration** tab and select **Environment variables**. Add the following Key/Values:

| Key | Value |
| -------- | ------- |
| ENVIRONMENT_NAME | poc |
| LOG_LEVEL | INFO |
| SECRET_PARAM_C4C_PASSWORD | Secret-c4c-password |
| SSM_PARAM_BUCKET_NAME | connect-bucket-name |
| SSM_PARAM_C4C_BASE_URL | c4c-base-url |
| SSM_PARAM_C4C_PHONE_SERVICE_ENDPOINT_PATH | c4c-phone-service-endpoint-path |
| SSM_PARAM_C4C_USERNAME | c4c-username |
| SSM_PARAM_ROOT_NAME | SAP-C4C-connect-poc

## 3.3 Setup Amazon EventBridge

Setup Amazon EventBridge to process contact events from Amazon Connect to post call summary in SAP Service Cloud

1. In AWS Console, search and select **Amazon EventBridge**
2. Select **Rules** on the left under **Buses**
3. Select **Create rule**
4. Under **Name**, enter `Connect-poc-CL-eventbridge-rule`. Select **Next**
5. **Event Source** keep default **AWS events or EventBridge partner events**
6. In **Creation Method** keep the default **Use pattern form**
   * Event source: **AWS services**
   * AWS service: **Amazon Connect**
   * Event type: **Contact Lens Post Call Rules Matched**
   * Select **Next**
8. In **Target types**, keep the **AWS service** selected, for **Select a target**, select **Lambda function**
8. For **Target Location** select **Target in this account**
9. For **Function** select the previously created Lambda function **poc-lambda-process-contact-lens-event**
10. Select **Next** until you reach the end and select **Create rule** to finish the setup

# 4. Amazon Connect Connector Deployment

You will now setup the Amazon Connect Connector/CTI-Widget for SAP Service Cloud. 

## 4.1 Setup S3 bucket for Amazon Connect CTI connector

1. Navigate to Amazon S3 console and create S3 bucket with a unique name,turn on Block all public access, pick defaults for all other options, select **Create bucket**.
2. Download all files from this folder [Connector-app](../connector-app). (In GitHub you can clone the repository or use Code-> Downlaod this directory).
5. In the downloaded folder Connector-app, open the script/config.js file and modify below values:
    * region: the AWS region where the Amazon Connect instance is provisioned, example: `region: "us-east-1"`
    * accessURL: the access URL of the Amazon Connect saved earlier, example: `accessURL: "https://XXXXXX.my.connect.aws"`
    * Save the file
6. Upload the files and folders within `Connector-app` to the S3 bucket, retaining the folder and file structure. 


## 4.2 Setup CloudFront for the Amazon Connect CTI adapter

1. In AWS Console, search and select **CloudFront**.
2. Select **Create a CloudFront distribution**.
4. Under **Origin domain**, click and under Amazon S3 section, choose the S3 bucket you created above.
4. For Origin access, select **Origin access control settings (recommended)**.
5. For **Origin access control**,  click on **Create new OAC**. Leave the default configuration and choose **Create**.
6. For the settings under **Default Cache Behavior Settings**, under **Viewer**, set **Viewer protocol policy** to **Redirect HTTP to HTTPS** and accept the default values for the rest.
7. In the **Web Application Firewall (WAF)** section, enable **AWS WAF security protections**.
8. In settings, In the Default root object text box, type in `index.html`.
9. Click **Create Distribution**.
   * Select the **Copy policy** button in the Yellow bar to copy the generated bucket policy.
   * Select **Go to S3 bucket permission** to go to the Amazon S3 bucket policy.
   * Edit the Bucket policy and paste the policy. Save the changes.
   * Close the S3 tab.
10. In the CloudFront console, under Distributions, you will see in last modified column **Deploying** - wait for it to complete.
11. After deployment complete, copy the distribution for use in future steps.
12. Your URL should be something like `https://d23xxxxxxx.cloudfront.net` .


## 4.3 Add Approved Origins

Add the Cloudfront URL and SAP Service Cloud URL in Amazon Connect as an approved origin.

1. Goto AWS Console -> Amazon Connect abd pick your instance 
3. On the left navigation, choose **Approved Origins** and select **Add domain**
4. Enter the Cloudfront URL into the field and select **Add domain** to save, `example: https://d23xxxxxxx.cloudfront.net`
5. Select **Add domain** again, enter the SAP Service Cloud URL and select **Add domain** to save, `example: https://XXXX.demo.crm.cloud.sap`

# 5. Validations

Proceed to the main [README](../README.md?#deployment-validation) and follow the steps on Deployment Validation, SAP Sales and Service Cloud Configuration and End to End Validation. Use the values for AmazonConnectInstanceURL, AmazonConnectPhoneNumber and CloudFrontDistributionURL from the values created above. 
