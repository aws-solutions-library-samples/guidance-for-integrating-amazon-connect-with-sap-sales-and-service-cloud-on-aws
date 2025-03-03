import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as connect from 'aws-cdk-lib/aws-connect';
import { PostInstallParameters } from './parameters';
import { Utils } from './connect-sdk-utils';

export class PostInstallConstruct extends Construct {

  constructor(
    scope: Construct,
    id: string,
    props: {
      parameters: PostInstallParameters;
    }) {
    super(scope, id);


    const connectSdkUtils = new Utils.ConnectSdkUtils(this)

    //associate approved domains to connect instance
    connectSdkUtils.addApprovedOriginDomain("cloudformation", {
        instanceArn: props.parameters.connectInstanceArn,
        origin: props.parameters.connectorApplicationUrl
    });
    connectSdkUtils.addApprovedOriginDomain("sap",{
      instanceArn: props.parameters.connectInstanceArn,
      origin: props.parameters.c4cBaseUrl
  })    

  }
}
