#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";
import { ConnectParameters, LambdaParameters } from '../lib/parameters'
import { AmazonConnectInstanceConstruct } from '../lib/connect-instance-construct';
import { PostInstallConstruct } from '../lib/post-install-construct';
import { WebApplicationWithCloudfrontStack } from '../lib/connector-app'
import { EventAndLamdbaConstruct } from '../lib/event-lambda-construct';
import * as process from "process";


const app = new cdk.App();
// Enable cdk-nag
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

//create the main CloudFormation Stack
const stack = new cdk.Stack(app, `AmazonConnectFullStack`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});

// Define CDK Parameters
const amazonConnectInstanceAliasParam = new cdk.CfnParameter(stack, "AmazonConnectInstanceAliasParam", {
  type: "String",
  description:
    "The alias of the Amazon Connect intance.",
});

const phoneNumberCountrycodeParam = new cdk.CfnParameter(stack, "PhoneNumberCountrycodeParam", {
  type: "String",
  description:
    "The country code of the phone number associated to the Amazon Connect (eg: US).",
  default: "US"
});

const environmentParam = new cdk.CfnParameter(stack, "EnvironmentParam", {
  type: "String",
  description:
    "The environment name (eg: dev, prod).",
});

const amazonS3BucketNameForConnect = new cdk.CfnParameter(stack, "ConnectBucketNameParam", {
  type: "String",
  description:
    "The s3 bucket name for the connect instance",
});

const amazonS3BucketNameForAppParam = new cdk.CfnParameter(stack, "AppConnectorBucketNameParam", {
  type: "String",
  description:
    "The s3 bucket name for the connector application",
});

const adminFirstNameParam = new cdk.CfnParameter(stack, "AdminFirstNameParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const adminLastNameParam = new cdk.CfnParameter(stack, "AdminLastNameParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const adminMailParam = new cdk.CfnParameter(stack, "AdminMailParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const adminPasswordParam = new cdk.CfnParameter(stack, "AdminPasswordParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const adminUserNameParam = new cdk.CfnParameter(stack, "AdminUserNameParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const agentFirstNameParam = new cdk.CfnParameter(stack, "AgentFirstNameParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const agentLastNameParam = new cdk.CfnParameter(stack, "AgentLastNameParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const agentMailParam = new cdk.CfnParameter(stack, "AgentMailParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const agentPasswordParam = new cdk.CfnParameter(stack, "AgentPasswordParam", {
  type: "String",
  description:
    "The first name of the connect admin",
});

const agentUserNameParam = new cdk.CfnParameter(stack, "AgentUserNameParam", {
  type: "String",
  description:
    "The username of the connect admin",
});


// SAP C4C Parameters
const c4cBaseUrlParam = new cdk.CfnParameter(stack, "c4cBaseUrlParam", {
  type: "String",
  description:
    "The base URL of C4C",
  default: 'https://myXXXXXXXX.XX.XXX.crm.cloud.sap'
});

const c4cPhoneServiceEndpointParam = new cdk.CfnParameter(stack, "c4cPhoneServiceEndpointParam", {
  type: "String",
  description:
    "The url path of the phone-service endpoint",
  default: '/sap/c4c/api/v1/phone-service/'
});

const c4cUsernameParam = new cdk.CfnParameter(stack, "c4cUsernameParam", {
  type: "String",
  description:
    "Username of C4C",
});

const c4cPasswordParam = new cdk.CfnParameter(stack, "c4cPasswordParam", {
  type: "String",
  description:
    "Password of C4C Username",
});




// Create a struct (object) for the parameters
const connectParameters: ConnectParameters = {
  environment: environmentParam.valueAsString,
  region: stack.region,
  // phoneNumberCountryCode: phoneNumberCountrycodeParam.valueAsString,
  instanceAlias: amazonConnectInstanceAliasParam.valueAsString,
  eventBridgeRuleName: 'SAPPostCallAnalytics',
  bucketName: amazonS3BucketNameForConnect.valueAsString,
  users: {
    administrator: {
      firstName: adminFirstNameParam.valueAsString,
      lastName: adminLastNameParam.valueAsString,
      email: adminMailParam.valueAsString,
      password: adminPasswordParam.valueAsString,
      username: adminUserNameParam.valueAsString,
    },
    agent: {
      firstName: agentFirstNameParam.valueAsString,
      lastName: agentLastNameParam.valueAsString,
      email: agentMailParam.valueAsString,
      password: agentPasswordParam.valueAsString,
      username: agentUserNameParam.valueAsString
    }
  },
};



const connectInstanceConstruct = new AmazonConnectInstanceConstruct(stack, "ConnectConstruct", { parameters: connectParameters })
NagSuppressions.addResourceSuppressions(
  connectInstanceConstruct,
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "Connect instance requires these permissions to manage contact flows and related resources",
      appliesTo: [
        'Resource::arn:aws:connect:*:*:instance/*',
        'Resource::arn:aws:connect:*:*:instance/*/contact-flow/*',
        'Resource::arn:aws:connect:*:*:instance/*/phone-number/*',
        'Resource::arn:aws:connect:*:*:instance/*/agent-status/*',
        'Resource::arn:aws:connect:*:*:instance/*/queue/*',
        'Resource::arn:aws:connect:*:*:instance/*/routing-profile/*',
        'Resource::arn:aws:connect:*:*:instance/*/security-profile/*',
        'Resource::arn:aws:connect:*:*:instance/*/user/*',
        {
          regex: '/^Resource::<ConnectConstruct.*\\.Arn>\/\\*$/g'
        },
        {
          regex: '/^Resource::<ConnectConstruct.*\\.PhoneNumberArn>\/\\*$/g'
        },
        {
          regex: '/^Resource::<ConnectConstruct.*\\.ContactFlowArn>\/\\*$/g'
        }
      ]
    }
  ],
  true
);
const lambdaParameters: LambdaParameters = {
  environment: environmentParam.valueAsString,
  region: stack.region,
  bucketName: amazonS3BucketNameForConnect.valueAsString,
  // the following are the parameter names in SSM. Not the actual values
  // ssmRootParameterName: 'Connect-poc-CL',
  ssmRootParameterName: `SAP-C4C-connect-${environmentParam.valueAsString}`,
  c4cBaseUrl: c4cBaseUrlParam.valueAsString,
  c4cPhoneServiceEndpointPath: c4cPhoneServiceEndpointParam.valueAsString,
  c4cUsername: c4cUsernameParam.valueAsString,
  c4cPassword: c4cPasswordParam.valueAsString,
};


const lambdaConstruct = new EventAndLamdbaConstruct(stack, "EventLambdaConstruct", { parameters: lambdaParameters })
const connectorApplicaitonConstruct = new WebApplicationWithCloudfrontStack(stack, "WebApplicationWithCloudfrontStack", {
  parameters: {
    bucketName: amazonS3BucketNameForAppParam.valueAsString,
    environment: environmentParam.valueAsString,
    region: stack.region,
    connectInstanceAccessUrl: connectInstanceConstruct.instanceAccessUrl,
    queueArn: connectInstanceConstruct.queueArn,
  }
});

const postInsallConstruct = new PostInstallConstruct(stack, "PostInstallConstruct", {
  parameters: {
    connectorApplicationUrl: `https://${connectorApplicaitonConstruct.cloudfrontUrl}`,
    connectInstanceArn: connectInstanceConstruct.instanceArn,
    c4cBaseUrl: c4cBaseUrlParam.valueAsString,
  }
});

//define CF outputs
new cdk.CfnOutput(stack, "AmazonConnectInstanceUrl", {
  value: connectInstanceConstruct.instanceAccessUrl,
  description: "Amazon Connect Instance URL",
  exportName: "AmazonConnectInstanceUrl",
});
new cdk.CfnOutput(stack, "AmazonConnectPhoneNumber", {
  value: connectInstanceConstruct.phoneNumber,
  description: "Amazon Connect Phone Number",
  exportName: "AmazonConnectPhoneNumber",
});
new cdk.CfnOutput(stack, "CloudFrontDistributionUrl", {
  value: connectorApplicaitonConstruct.cloudfrontUrl,
  description: "CloudFront distribution URL",
  exportName: "CloudFrontDistributionUrl",
});


NagSuppressions.addResourceSuppressions(
  postInsallConstruct,
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "Connect instance requires these permissions to manage contact flows and related resources",
      appliesTo: [
        'Resource::arn:aws:connect:*:*:instance/*',
        'Resource::arn:aws:connect:*:*:instance/*/contact-flow/*',
        'Resource::arn:aws:connect:*:*:instance/*/phone-number/*',
        'Resource::arn:aws:connect:*:*:instance/*/agent-status/*',
        'Resource::arn:aws:connect:*:*:instance/*/queue/*',
        'Resource::arn:aws:connect:*:*:instance/*/routing-profile/*',
        'Resource::arn:aws:connect:*:*:instance/*/security-profile/*',
        'Resource::arn:aws:connect:*:*:instance/*/user/*',
        {
          regex: '/^Resource::<ConnectConstruct.*\\.Arn>\/\\*$/g'
        },
        {
          regex: '/^Resource::<ConnectConstruct.*\\.PhoneNumberArn>\/\\*$/g'
        },
        {
          regex: '/^Resource::<ConnectConstruct.*\\.ContactFlowArn>\/\\*$/g'
        }
      ]
    }
  ],
  true
);




NagSuppressions.addStackSuppressions(stack, [
  {
    id: 'AwsSolutions-L1',
    reason: 'AwsCustomResource is controlled internally by CDK',
  },
  {
    id: "AwsSolutions-IAM5",
    reason:
      "Curated list of Managed Policies are allowed as they are not over-privileged",
    appliesTo: [
      "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ],
  },
  {
    id: "AwsSolutions-IAM4",
    reason:
      "Curated list of Managed Policies are allowed as they are not over-privileged",
    appliesTo: [
      "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ],
  },
  {
    id: 'AwsSolutions-IAM5',
    reason:
      'Suppress AwsSolutions-IAM5 resource and action based findings for Connect and Lammbda default policy',
    appliesTo: [
      {
        // regex: '/^Action::connect(.*):\\*$/g'
        regex: '/^Action::connect:(.*)$/g'

      },
      {
        regex: '/^Action::s3:(.*)$/g'
      },
      {
        regex: '/^Action::s3-object-lambda:(.*)$/g'
      },
      {
        regex: '/^Action::ssm:(.*)$/g'
      },
      {
        regex: '/^Action::logs(.*):\\*$/g'
      },
    ]
  },
  { id: 'AwsSolutions-S1', reason: 'Logs bucket does not require logging configuration' },
  { id: "AwsSolutions-CFR4", reason: "TLS 1.2 is the default." },
  { id: "AwsSolutions-CFR5", reason: "TLS 1.2 is the default." },

]);

