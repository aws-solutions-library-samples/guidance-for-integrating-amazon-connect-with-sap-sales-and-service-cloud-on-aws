import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { ConnectorAppParameters } from './parameters';
import { NagSuppressions } from 'cdk-nag';

export class WebApplicationWithCloudfrontStack extends Construct {

  public readonly cloudfrontUrl: string;

  constructor(
    scope: Construct,
    id: string,
    props: {
      parameters: ConnectorAppParameters;
    }) {
    super(scope, id);

    const environment = props.parameters.environment;

    // Create the S3 bucket that will be used to deploy the static web application
    const staticWebappBucket = new s3.Bucket(this, `${id}ConnectorAppBucket-${Stack.of(this).region}`, {
      bucketName: props.parameters.bucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      accessControl: s3.BucketAccessControl.PRIVATE,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      autoDeleteObjects: true,
      enforceSSL: true,
      versioned: true,
    });
    NagSuppressions.addResourceSuppressions(
      [staticWebappBucket],
      [
        {
          id: "AwsSolutions-S1",
          reason:
            "The S3 Bucket has server access logs disabled––we use CloudFront access logs instead",
        },
      ]
    );

    const accessLogsBucket = new cdk.aws_s3.Bucket(
      scope,
      `${id}AccessLogsBucket`,
      {
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        objectOwnership: cdk.aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      }
    );
    NagSuppressions.addResourceSuppressions(
      [accessLogsBucket],
      [
        {
          id: "AwsSolutions-S1",
          reason: "This S3 Bucket is itself an access logs bucket",
        },
      ]
    );

    //// The CloudFront Distribution with default behavior for static resources
    const distribution = new cloudfront.Distribution(this, `${id}ConnectorAppDistribution-${Stack.of(this).region}`, {
      comment: `(${environment}) Amazon Connect Integration with SAP Sales and Service Cloud web application`,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      enableLogging: true,
      logBucket: accessLogsBucket,
      logFilePrefix: 'cloudfrontlogs',
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.SSL_V3,
      sslSupportMethod: cdk.aws_cloudfront.SSLMethod.SNI,

      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/error.html',
          ttl: Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/error.html',
          ttl: Duration.minutes(30),
        },
      ],
      defaultRootObject: 'index.html',
      defaultBehavior: {
        //This behavior represents all the static content
        origin:
          cdk.aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
            staticWebappBucket
          ),


        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        compress: true
      },
    });

    NagSuppressions.addResourceSuppressions(
      [distribution],
      [
        {
          id: "AwsSolutions-CFR1",
          reason:
            "The CloudFront distribution may require Geo restrictions.––No concern for prototype",
        },
        {
          id: "AwsSolutions-CFR2",
          reason:
            "The CloudFront distribution may require integration with AWS WAF.––No concern for prototype",
        },
        {
          id: "AwsSolutions-CFR4",
          reason:
            "The CloudFront distribution allows for SSLv3 or TLSv1 for HTTPS viewer connections.––No concern for prototype",
        },
      ]
    );


    //// Configure OAC for S3 bucket and CloudFront
    const oac = new cloudfront.CfnOriginAccessControl(this, `${id}ConnectorAppOAC-${Stack.of(this).region}`, {
      originAccessControlConfig: {
        name: `WebsiteOACForConnectorApp-${Stack.of(this).region}`,
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4'
      }
    });

    //// Configure S3 Bucket to be accessed by Cloudfront only
    const allowCloudFrontReadOnlyPolicy = new iam.PolicyStatement({
      sid: `allowCloudFrontReadOnlyPolicy-${Stack.of(this).region}`,
      actions: ['s3:GetObject'],
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      effect: iam.Effect.ALLOW,
      conditions: {
        'StringEquals': {
          "AWS:SourceArn": "arn:aws:cloudfront::" + Stack.of(this).account + ":distribution/" + distribution.distributionId
        }
      },
      resources: [staticWebappBucket.bucketArn, staticWebappBucket.bucketArn.concat('/').concat('*')]
    });
    staticWebappBucket.addToResourcePolicy(allowCloudFrontReadOnlyPolicy)

    //// OAC is not supported by CDK L2 construct yet. L1 construct is required
    const cfnDistribution = distribution.node.defaultChild as cloudfront.CfnDistribution
    // Enable OAC
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.OriginAccessControlId',
      oac.getAtt('Id')
    )
    // Disable OAI
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Origins.0.S3OriginConfig.OriginAccessIdentity',
      '',
    )

    //// Deploy sample data
    const deployApp = new s3deploy.BucketDeployment(this, `${id}ConnectorAppS3Deploy-${Stack.of(this).region}`, {
      sources: [
        s3deploy.Source.asset('../connector-app')
      ],
      destinationBucket: staticWebappBucket,
      // destinationKeyPrefix: s3Prefix
    });

    const s3deployConfig = new s3deploy.DeployTimeSubstitutedFile(this, `${id}ConnectorAppConfigS3Deploy-${Stack.of(this).region}`, {
      source: '../connector-app/scripts/config.js',
      destinationBucket: staticWebappBucket,
      destinationKey: `scripts/config.js`, // optional prefix in destination bucket
      substitutions: {
        region: Stack.of(this).region,
        accessURL: props.parameters.connectInstanceAccessUrl,
      },
    });

    NagSuppressions.addResourceSuppressions(
      staticWebappBucket,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'BucketDeployment requires access to destination bucket to deploy web application files',
          appliesTo: [
            "Resource::<WebApplicationWithCloudfrontStackWebApplicationWithCloudfrontStackConnectorAppBucketuseast15126C91E.Arn>/*",
            {
              regex: '/^Resource::<WebApplicationWithCloudfrontStackWebApp.*\\.Arn>\/\\*$/g'
            },
            'Action::s3:*',
          ]
        }
      ],
      true
    );

    [deployApp, s3deployConfig].forEach(deployment => {
      NagSuppressions.addResourceSuppressions(
        deployment,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'BucketDeployment requires access to destination bucket to deploy web application files',
            appliesTo: [
              "Resource::<WebApplicationWithCloudfrontStackWebApplicationWithCloudfrontStackConnectorAppBucketuseast15126C91E.Arn>/*",
              {
                regex: '/^Resource::<WebApplicationWithCloudfrontStackWebApp.*\\.Arn>\/\\*$/g'
              },
              'Action::s3:*',
            ]
          }
        ],
        true
      )
    });

    [deployApp, s3deployConfig].forEach(deployment => {
      NagSuppressions.addResourceSuppressions(
        deployment,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'BucketDeployment requires access to destination bucket to deploy web application files',
            appliesTo: [
              `Resource::${staticWebappBucket.bucketArn}/*`,
              'Action::s3:GetObject',
              'Action::s3:PutObject',
              'Action::s3:DeleteObject',
              'Action::s3:ListBucket'
            ]
          }
        ],
        true
      );
    });


    // this suppression is required because Using the BucketDeployment construct generates an IAM policy which is not approved by CDK Nag tool.
    // https://github.com/aws/aws-cdk/issues/27210
    var customDeployment = scope.node.children.filter(node => node.node.id.startsWith('Custom::CDKBucketDeployment'))[0].node.id;
    NagSuppressions.addResourceSuppressions(
      scope.node.findChild(customDeployment).node.findChild('ServiceRole').node.findChild('DefaultPolicy').node.defaultChild as cdk.CfnResource,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'BucketDeployment requires access to destination bucket to deploy web application files',
        }
      ],
      true
    );

    this.cloudfrontUrl = distribution.distributionDomainName

  }
}