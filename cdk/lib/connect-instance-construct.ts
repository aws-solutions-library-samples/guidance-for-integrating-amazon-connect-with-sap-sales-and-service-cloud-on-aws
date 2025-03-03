import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as connect from 'aws-cdk-lib/aws-connect';
import { ConnectParameters } from './parameters';
import * as fs from 'fs';
import { Utils } from './connect-sdk-utils';
import * as mustache from 'mustache'
import * as s3 from 'aws-cdk-lib/aws-s3';
import { NagSuppressions } from 'cdk-nag';

export class AmazonConnectInstanceConstruct extends Construct {

  public readonly instance: connect.CfnInstance;
  public readonly instanceAccessUrl: string;
  public readonly phoneNumber: string;
  public readonly instanceArn: string;
  public readonly queueArn: string;
  public readonly bucketName: string;

  constructor(
    scope: Construct,
    id: string,
    props: {
      parameters: ConnectParameters;
    }) {
    super(scope, id);

    //instantiate the utility client to hanle Connect resources and custom resources
    const connectSdkUtils = new Utils.ConnectSdkUtils(this)

    const instance = connectSdkUtils.createInstance(props.parameters.instanceAlias);


    this.instance = instance.cfnInstance;
    this.instanceArn = instance.instanceArn;
    this.instanceAccessUrl = instance.instanceAccessUrl;


    // Create the S3 bucket that will be used to deploy the static web application
    const connectBucket = new s3.Bucket(this, `${scope}S3Bucket`, {
      bucketName: props.parameters.bucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      accessControl: s3.BucketAccessControl.PRIVATE,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true,
    });


    connectSdkUtils.associateStorageConfig({
      connect_instance: instance.cfnInstance,
      storageType: "S3",
      resourceType: "CALL_RECORDINGS",
      bucketName: props.parameters.bucketName,
      bucketPrefix: `connect/${props.parameters.instanceAlias}/CallRecordings`
    })

    connectSdkUtils.associateStorageConfig({
      connect_instance: instance.cfnInstance,
      storageType: "S3",
      resourceType: "CHAT_TRANSCRIPTS",
      bucketName: props.parameters.bucketName,
      bucketPrefix: `connect/${props.parameters.instanceAlias}/ChatTranscripts`
    })

    connectSdkUtils.associateStorageConfig({
      connect_instance: instance.cfnInstance,
      storageType: "S3",
      resourceType: "SCHEDULED_REPORTS",
      bucketName: props.parameters.bucketName,
      bucketPrefix: `connect/${props.parameters.instanceAlias}/Reports`
    })

    //// Not supported. error: ResourceType: EMAIL_MESSAGES is not a valid enum value
    // connectSdkUtils.associateStorageConfig({
    //   connect_instance: instance.cfnInstance,
    //   storageType: "S3",
    //   resourceType: "EMAIL_MESSAGES",        
    //   bucketName: props.parameters.bucketName,
    //   bucketPrefix: `connect/${props.parameters.instanceAlias}/EmailMessages`
    // })

    //get the BasicQueue queue details
    const queueName = "BasicQueue";
    const queue = connectSdkUtils.searchQueueByName({
      queueName: queueName,
      connect_instance: instance.cfnInstance
    })
    const queueArn = queue.getResponseField("Queues.0.QueueArn")
    const queueId = queue.getResponseField("Queues.0.QueueId")
    this.queueArn = queueArn;

    const outboundContactFlow = connectSdkUtils.searchContactFlowByName({
      contactFlowName: "Default outbound",
      connect_instance: instance.cfnInstance
    })
    const outboundContactFlowId = outboundContactFlow.getResponseField("ContactFlows.0.Id")

    //create users
    const routingProfileArn = connectSdkUtils.getRoutingProfileForName({
      routingProfileName: "Basic Routing Profile",
      connect_instance: instance.cfnInstance
    }).getResponseField("RoutingProfiles.0.RoutingProfileArn");

    const adminUser = connectSdkUtils.createUser({
      cdkConstructId: "Admin",
      connect_instance: instance.cfnInstance,
      username: props.parameters.users.administrator.username,
      firstName: props.parameters.users.administrator.firstName,
      lastName: props.parameters.users.administrator.lastName,
      email: props.parameters.users.administrator.email,
      password: props.parameters.users.administrator.password,
      routingProfileArn: routingProfileArn,
      securityProfileArns: [connectSdkUtils.getSecurityProfileForName({
        securityProfileName: "Admin",
        connect_instance: instance.cfnInstance
      }).getResponseField("SecurityProfiles.0.Arn")]
    })

    const agentUser = connectSdkUtils.createUser({
      cdkConstructId: "Agent1",
      connect_instance: instance.cfnInstance,
      username: props.parameters.users.agent.username,
      firstName: props.parameters.users.agent.firstName,
      lastName: props.parameters.users.agent.lastName,
      email: props.parameters.users.agent.email,
      password: props.parameters.users.agent.password,
      routingProfileArn: routingProfileArn,
      securityProfileArns: [connectSdkUtils.getSecurityProfileForName({
        securityProfileName: "Agent",
        connect_instance: instance.cfnInstance
      }).getResponseField("SecurityProfiles.0.Arn")]
    })

    // create the main flow by importing it
    const jsonContactFlowContent = mustache.render(fs.readFileSync('../contact-flow/1-MainFlow.json', 'utf-8').toString(), {
      queueArn: queueArn,
      queueName: queueName,
    });
    const flowName = "1 - MainFlow";
    const connectContactFlow = new cdk.aws_connect.CfnContactFlow(this, `${scope}ContactFlow`, {
      instanceArn: instance.cfnInstance.attrArn,
      name: "1 - MainFlow",
      type: "CONTACT_FLOW",
      content: jsonContactFlowContent
    });

    // //associate the phone number to the flow
    const phoneNumber = connectSdkUtils.createAndAssociatePhoneNumber({
      connect_instance: instance.cfnInstance,
      contactFlow: connectContactFlow,
      phoneType: "DID",
      countryCode: "US", //enforce to claim an US number
    });
    this.phoneNumber = phoneNumber.phoneNumberAddress;

    connectSdkUtils.updateQueueOutboundCallerConfig({
      connect_instance: instance.cfnInstance,
      queueId: queueId,
      flowId: outboundContactFlowId,
      phoneNumberId: phoneNumber.phoneNumberId
    });

    //get the agent user
    const agentUserCustomResource = connectSdkUtils.searchUserForUsername({
      username: props.parameters.users.agent.username,
      connect_instance: instance.cfnInstance
    });
    //this dependency is required to ensure the CfnUser is created before searching for it.
    //otherwise the stack creation wont work.
    agentUserCustomResource.node.addDependency(agentUser);

    //create rule
    const rule = connectSdkUtils.createRule({
      connect_instance: instance.cfnInstance,
      ruleName: "SAPPostCallAnalytics",
      eventSourceName: "OnPostCallAnalysisAvailable",
      queueIdList: [queueId],
      agentIdList: [agentUserCustomResource.getResponseField("Users.0.Id")],
      eventBridgeActionRuleName: props.parameters.eventBridgeRuleName
    })


    connectSdkUtils.updateAgentSecurityProfile({
      instanceArn: instance.instanceArn
    })
  }
}
