import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaParameters } from './parameters';
import { Code, Runtime, Function, Alias } from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';

import { PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import path = require('path');
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { NagSuppressions } from 'cdk-nag';


export class EventAndLamdbaConstruct extends Construct {
    constructor(
        scope: Construct,
        id: string,
        props: {
            parameters: LambdaParameters;
        }) {
        super(scope, id);


        const ssmRootParameterName = props.parameters.ssmRootParameterName;
        const environment = props.parameters.environment;
        const rootParam = `/${ssmRootParameterName}/${environment}`
        const c4cBaseUrlParamName = "c4c-base-url"
        const c4cPhoneServiceEndpointPathParamName = "c4c-phone-service-endpoint-path"
        const c4cUsernameParamName = "c4c-username"
        const c4cPasswordParamName = "Secret-c4c-password"
        const bucketNameParamName = "connect-bucket-name"


        new ssm.StringParameter(this, 'SSMParameter-c4c-base-url', {
            simpleName: false,
            parameterName: `${rootParam}/${c4cBaseUrlParamName}`,
            stringValue: props.parameters.c4cBaseUrl,
        });
        new ssm.StringParameter(this, 'SSMParameter-c4c-phone-service-endpoint-path', {
            simpleName: false,
            parameterName: `${rootParam}/${c4cPhoneServiceEndpointPathParamName}`,
            description: 'Enter the path of the phone service. Eg: /sap/c4c/api/v1/phone-service/',
            stringValue: props.parameters.c4cPhoneServiceEndpointPath,
        });
        new ssm.StringParameter(this, 'SSMParameter-c4c-username', {
            simpleName: false,
            parameterName: `${rootParam}/${c4cUsernameParamName}`,
            stringValue: props.parameters.c4cUsername,
        });

        const secretPassword = new secrets.Secret(this, 'Secret-c4c-password', {
            secretName: c4cPasswordParamName,
            secretStringValue: cdk.SecretValue.unsafePlainText(
                props.parameters.c4cPassword,
            ),
        });

        NagSuppressions.addResourceSuppressions(
            secretPassword,
            [
                {
                    id: 'AwsSolutions-SMG4',
                    reason: 'Secret rotation is not needed, as this password is managed in SAP Sales and Service Cloud'
                }
            ],
            true
        );


        new ssm.StringParameter(this, 'SSMParameter-connect-bucket-name', {
            simpleName: false,
            parameterName: `${rootParam}/${bucketNameParamName}`,
            stringValue: props.parameters.bucketName,
        });

        // create sns topic for lambda dead letter queue
        const lambdaDlqTopic = new cdk.aws_sns.Topic(this, `${id}LambdaDlqTopic`, {
            topicName: `ConnectorLambdaDlqTopic-${environment}`,
        });
        // Add a policy to enforce HTTPS
        lambdaDlqTopic.addToResourcePolicy(
            new cdk.aws_iam.PolicyStatement({
                sid: 'AllowPublishThroughSSLOnly',
                effect: cdk.aws_iam.Effect.DENY,
                principals: [new cdk.aws_iam.AnyPrincipal()],
                actions: ['sns:Publish'],
                resources: [lambdaDlqTopic.topicArn],
                conditions: {
                    'Bool': {
                        'aws:SecureTransport': 'false'
                    }
                }
            })
        );

        NagSuppressions.addResourceSuppressions(
            lambdaDlqTopic,
            [
                {
                    id: 'AwsSolutions-SNS3',
                    reason: 'SNS Topic is configured to enforce HTTPS/TLS through resource policy'
                }
            ],
            true
        );


        const s3Bucket = cdk.aws_s3.Bucket.fromBucketName(this, 'ConnectS3Bucket', props.parameters.bucketName);

        //create lambda layer including requests and boto3
        const lambdaLayer = new PythonLayerVersion(this, `${id}LambdaLayer`, {
            layerVersionName: "connector_lambda_layer",
            entry: path.join(__dirname, "../../lambda/layer"),
            compatibleRuntimes: [
                Runtime.PYTHON_3_12,
            ],
            description: "A layer that contains the required modules",
            license: "MIT License",
        });

        const lambdaFunction = new Function(this, `${id}LambdaFunction`, {
            functionName: `connector_lambda_function-${environment}`,
            runtime: Runtime.PYTHON_3_12,
            code: Code.fromAsset(path.resolve(__dirname, '../../lambda/')),
            handler: 'connector_lambda.lambda_handler',
            layers: [lambdaLayer],
            environment: {
                LOG_LEVEL: "INFO",
                ENVIRONMENT_NAME: environment,
                SSM_PARAM_ROOT_NAME: ssmRootParameterName,
                SSM_PARAM_C4C_BASE_URL: c4cBaseUrlParamName,
                SSM_PARAM_C4C_PHONE_SERVICE_ENDPOINT_PATH: c4cPhoneServiceEndpointPathParamName,
                SSM_PARAM_C4C_USERNAME: c4cUsernameParamName,
                SECRET_PARAM_C4C_PASSWORD: c4cPasswordParamName,
                SSM_PARAM_BUCKET_NAME: bucketNameParamName,
            },
            deadLetterTopic: lambdaDlqTopic,
            timeout: cdk.Duration.seconds(300)
        }
        );

        const s3ReadonlyStatement = new cdk.aws_iam.PolicyStatement({
            actions: [
                "s3:Get*",
                "s3:List*",
                "s3:Describe*",
                "s3:ListBucket"
            ],
            resources: [
                s3Bucket.bucketArn,
                `${s3Bucket.bucketArn}/*`
            ]
        });
        const ssmReadonlyStatement = new cdk.aws_iam.PolicyStatement({
            actions: [
                "ssm:Describe*",
                "ssm:Get*",
                "ssm:List*"
            ],
            resources: [
                "*"
            ]
        });
        const cloudwatchReadonlyStatement = new cdk.aws_iam.PolicyStatement({
            actions: [
                "cloudwatch:GenerateQuery"
            ],
            resources: [
                "*"
            ]
        });
        const secretsmanagereadonlyStatement = new cdk.aws_iam.PolicyStatement({
            actions: [
                "secretsmanager:GetSecretValue",
            ],
            resources: [
                secretPassword.secretArn
            ]
        });
        lambdaFunction.addToRolePolicy(s3ReadonlyStatement);
        lambdaFunction.addToRolePolicy(ssmReadonlyStatement);
        lambdaFunction.addToRolePolicy(cloudwatchReadonlyStatement);
        lambdaFunction.addToRolePolicy(secretsmanagereadonlyStatement);

        // Add cdk-nag suppression for the Lambda function's role
        NagSuppressions.addResourceSuppressions(
            lambdaFunction!,
            [
                {
                    id: 'AwsSolutions-IAM5',
                    reason: 'Lambda function needs access to read objects from the Connect S3 bucket to process contact lens data',
                    appliesTo: [
                        {
                            regex: '/^Resource::arn:aws:s3:::.*\/\\*$/g'
                        },
                        'Action::s3:*',
                    ]
                },
                {
                    id: 'AwsSolutions-IAM5',
                    reason: 'Lambda function needs to read SSM parameters for configuration',
                    appliesTo: [
                        'Resource::*',
                        'Action::ssm:Describe*',
                        'Action::ssm:Get*',
                        'Action::ssm:List*'
                    ]
                },
                {
                    id: 'AwsSolutions-IAM5',
                    reason: 'Lambda function needs CloudWatch permissions for query generation',
                    appliesTo: [
                        'Resource::*',
                        'Action::cloudwatch:GenerateQuery'
                    ]
                }
            ],
            true
        );


        // //create an eventbridge bus with event archive policy
        // const eventBridgeBus = new cdk.aws_events.EventBus(this, `${id}EventBridgeBus`, {
        //     eventBusName: `ConnectorEventBridgeBus-${environment}`,
        // });

        const eventBridgeBus = cdk.aws_events.EventBus.fromEventBusName(this, 'AmazonEventBus', 'default');

        //// The default event bus does not support archive
        // eventBridgeBus.archive('AmazonEventBridgeBusArchive', {
        //     archiveName: `AmazonEventBridgeBusArchive-${environment}`,
        //     description: 'Amazon EventBridge Bus Archive',
        //     eventPattern: {
        //         account: [cdk.Stack.of(this).account],
        //     },
        //     retention: cdk.Duration.days(30),
        // })

        const connectEventRule = new cdk.aws_events.Rule(this, 'ConnectEventsBusRule', {
            ruleName: `Connect-${props.parameters.environment}-CL-eventbridge-rule`,
            description: 'Rule matching audit events',
            eventBus: eventBridgeBus,
            eventPattern: {
                source: ["aws.connect"],
                detailType: ["Contact Lens Post Call Rules Matched"]
            }
        });
        connectEventRule.addTarget(new targets.LambdaFunction(lambdaFunction, {}));



    }
}
