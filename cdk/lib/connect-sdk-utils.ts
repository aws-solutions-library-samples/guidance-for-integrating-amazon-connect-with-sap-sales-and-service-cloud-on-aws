import * as cdk from 'aws-cdk-lib';
import { CfnContactFlow, CfnInstance, CfnPhoneNumber, CfnRule, CfnUser } from 'aws-cdk-lib/aws-connect';
import { Construct } from 'constructs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from 'cdk-nag';

export namespace Utils {
    export interface CommonProps {
        readonly connect_instance: CfnInstance,
    }

    export interface CreatePhoneNumberProps extends CommonProps {
        contactFlow: CfnContactFlow,
        // phoneNumber: CfnPhoneNumber,
        countryCode: string,
        phoneType: string
    }
    export interface UserProps extends CommonProps {
        username: string,
    }
    export interface CreateUserProps extends UserProps {
        //cdkConstructId MUST be a plain simple string, not a CDK parameter value
        cdkConstructId: string,
        password: string,
        firstName: string,
        lastName: string,
        email: string,
        securityProfileArns: string[],
        routingProfileArn: string,
    }

    export interface GetQueueProps extends CommonProps {
        queueName: string
    }
    export interface GetContactFlowProps extends CommonProps {
        contactFlowName: string
    }
    export interface GetSecurityProfileProps extends CommonProps {
        securityProfileName: string
    }

    export interface GetRoutingProfileProps extends CommonProps {
        routingProfileName: string
    }
    export interface CreateRuleProps extends CommonProps {
        ruleName: string,
        eventSourceName: string,
        queueIdList: string[],
        agentIdList: string[],
        eventBridgeActionRuleName: string
    }

    export interface AssociateStorageConfig extends CommonProps {
        storageType: string,
        resourceType: string,
        bucketName: string,
        bucketPrefix: string
    }

    export interface InstanceExportProps {
        cfnInstance: CfnInstance,
        instanceArn: string,
        instanceId: string
        instanceAccessUrl: string,
    }

    export interface PhoneNumberExportProps {
        phoneNumberAddress: string,
        phoneNumberArn: string,
        phoneNumberId: string,
    }

    export interface ApprovedDomainProps {
        instanceArn: string,
        origin: string
    }

    export interface UpdateAdminSecurityProfileProps {
        instanceArn: string,
    }

    export interface UpdateQueueOutboundCallerConfig extends CommonProps {
        queueId: string,
        phoneNumberId: string,
        flowId: string
    }

    export class ConnectSdkUtils {
        private instance: CfnInstance;
        private scope: Construct
        constructor(scope: Construct) {
            this.scope = scope;
        }

        public createInstance(alias: string): InstanceExportProps {
            const connectInstance = new cdk.aws_connect.CfnInstance(this.scope, `${this.scope}ConnectInstance`, {
                attributes: {
                    inboundCalls: true,
                    outboundCalls: true,
                    contactflowLogs: true
                },
                identityManagementType: 'CONNECT_MANAGED',
                instanceAlias: alias,
            });

            const describeInstanceCommandInput = {
                service: 'Connect',
                action: 'DescribeInstanceCommand',
                parameters: {
                    InstanceId: connectInstance.attrArn,
                },
                physicalResourceId: cr.PhysicalResourceId.of(connectInstance.attrId)
            };

            const describeInstance = new cr.AwsCustomResource(this.scope, `${this.scope}DescribeConnectInstance`, {
                onCreate: describeInstanceCommandInput,
                onUpdate: describeInstanceCommandInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [connectInstance.attrArn,
                        `${connectInstance.attrArn}/*`
                        ],
                    }),
                    new PolicyStatement({
                        actions: ["ds:DescribeDirectories"],
                        resources: ["*"],
                    }),
                ]),
            });

            describeInstance.node.addDependency(connectInstance);

            const returnValue = {
                cfnInstance: connectInstance,
                instanceArn: connectInstance.attrArn,
                instanceId: connectInstance.attrId,
                instanceAccessUrl: describeInstance.getResponseField("Instance.InstanceAccessUrl"),
            }

            // Add suppressions for the custom resource
            NagSuppressions.addResourceSuppressions(
                describeInstance,
                [
                    {
                        id: 'AwsSolutions-IAM5',
                        reason: 'Describe Connect  requires permissions to describe directories. ',
                        appliesTo: [
                            `Resource::*`,
                        ]
                    }
                ],
                true
            );

            return returnValue;
        }

        //create a method to generate a string with 5 random character
        public generatePassword(): string {
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }

        public associateStorageConfig(props: AssociateStorageConfig) {
            const storageConfig = new cdk.aws_connect.CfnInstanceStorageConfig(this.scope, `${this.scope}InstanceStorageConfig${props.resourceType}`, {
                instanceArn: props.connect_instance.attrArn,
                resourceType: props.resourceType,
                storageType: props.storageType,
                s3Config: {
                    bucketName: props.bucketName,
                    bucketPrefix: props.bucketPrefix
                }

            });
            storageConfig.node.addDependency(props.connect_instance);
        }


        public createAndAssociatePhoneNumber(props: CreatePhoneNumberProps): PhoneNumberExportProps {
            // // claim a number
            const phoneNumber = new cdk.aws_connect.CfnPhoneNumber(this.scope, `${this.scope}PhoneNumber`, {
                targetArn: props.connect_instance.attrArn,
                countryCode: props.countryCode,
                type: props.phoneType
            });
            // this.cloudformationDebugLog(props.connect_instance.attrArn)
            const associateNumberWithFlow = new cr.AwsCustomResource(this.scope, `${this.scope}AssociateConnectNumber`, {
                onUpdate: {
                    service: 'Connect',
                    action: 'AssociatePhoneNumberContactFlowCommand',
                    parameters: {
                        InstanceId: props.connect_instance.attrArn,
                        ContactFlowId: props.contactFlow.attrContactFlowArn,
                        PhoneNumberId: phoneNumber.attrPhoneNumberArn,
                    },
                    physicalResourceId: cr.PhysicalResourceId.of(phoneNumber.attrAddress)
                },
                onDelete: {
                    service: 'Connect',
                    action: 'DisassociatePhoneNumberContactFlowCommand',
                    parameters: {
                        InstanceId: props.connect_instance.attrArn,
                        ContactFlowId: props.contactFlow.attrContactFlowArn,
                        PhoneNumberId: phoneNumber.attrPhoneNumberArn,
                    },
                    physicalResourceId: cr.PhysicalResourceId.of(phoneNumber.attrAddress)
                },
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: ['*'],
                    }),

                ])
            });

            const returnValues = {
                phoneNumberAddress: phoneNumber.attrAddress,
                phoneNumberArn: phoneNumber.attrPhoneNumberArn,
                phoneNumberId: phoneNumber.attrPhoneNumberArn,
            }

            // Add suppressions for the custom resource
            NagSuppressions.addResourceSuppressions(
                associateNumberWithFlow,
                [
                    {
                        id: 'AwsSolutions-IAM5',
                        reason: 'AssociatePhoneNumberContactFlow and DisassociatePhoneNumberContactFlowCommand require access to Connect instance and phone number resources. ' +
                            'The wildcard is needed for sub-resources of the Connect instance.',
                        appliesTo: [
                            `Resource::arn:aws:connect:${cdk.Stack.of(this.scope).region}:${cdk.Stack.of(this.scope).account}:*`,
                            `Resource::${props.connect_instance.attrArn}/*`,
                            `Resource::${phoneNumber.attrPhoneNumberArn}/*`,
                            'Resource::*'
                        ]
                    },             
                ],
                true
            );

            return returnValues;
        }



        public searchQueueByName(props: GetQueueProps) {
            const searchQueueCommandInput = {
                service: 'Connect',
                action: 'SearchQueuesCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    MaxResults: 1,
                    SearchCriteria: {
                        StringCondition: {
                            FieldName: "Name",
                            Value: props.queueName,
                            ComparisonType: "EXACT",
                        }
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.fromResponse('Queues.0.QueueId')
            };

            return new cr.AwsCustomResource(this.scope, `${this.scope}GetBasicQueue`, {
                onCreate: searchQueueCommandInput,
                onUpdate: searchQueueCommandInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [props.connect_instance.attrArn,
                        `${props.connect_instance.attrArn}/*`
                        ],
                    }),
                ]),
            });
        }

        public searchContactFlowByName(props: GetContactFlowProps) {
            const searchQueueCommandInput = {
                service: 'Connect',
                action: 'SearchContactFlowsCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    MaxResults: 1,
                    SearchCriteria: {
                        StringCondition: {
                            FieldName: "name",
                            Value: props.contactFlowName,
                            ComparisonType: "EXACT",
                        }
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.fromResponse('ContactFlows.0.Id')
            };

            return new cr.AwsCustomResource(this.scope, `${this.scope}GetContactFlow`, {
                onCreate: searchQueueCommandInput,
                onUpdate: searchQueueCommandInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [props.connect_instance.attrArn,
                        `${props.connect_instance.attrArn}/*`],
                    }),
                ]),
            });
        }

        public updateQueueOutboundCallerConfig(props: UpdateQueueOutboundCallerConfig) {
            const updateQueueOutboundCallerConfigInput = {
                service: 'Connect',
                action: 'UpdateQueueOutboundCallerConfigCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    QueueId: props.queueId,
                    OutboundCallerConfig: {
                        OutboundFlowId: props.flowId,
                        OutboundCallerIdNumberId: props.phoneNumberId
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of(`UpdateQueueOutboundCallerConfigCommand${props.queueId}-${props.flowId}`)
            };

            const deleteQueueOutboundCallerConfigInput = {
                service: 'Connect',
                action: 'UpdateQueueOutboundCallerConfigCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    QueueId: props.queueId,
                    OutboundCallerConfig: {
                        OutboundFlowId: undefined,
                        OutboundCallerIdNumberId: undefined
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}UpdateQueueOutboundCallerConfigCommand`)
            };

            return new cr.AwsCustomResource(this.scope, `${this.scope}UpdateQueueOutboundCallerConfigCommand`, {
                onCreate: updateQueueOutboundCallerConfigInput,
                onDelete: deleteQueueOutboundCallerConfigInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [props.connect_instance.attrArn,
                        `${props.connect_instance.attrArn}/*`],
                    }),
                ]),
            });
        }


        public getRoutingProfileForName(props: GetRoutingProfileProps) {
            const searchRoutingProfileInput = {
                service: 'Connect',
                action: 'SearchRoutingProfilesCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    MaxResults: 1,
                    SearchCriteria: {
                        StringCondition: {
                            FieldName: "name",
                            Value: props.routingProfileName,
                            ComparisonType: "EXACT",
                        }
                    }
                },
                // physicalResourceId: cr.PhysicalResourceId.fromResponse('RoutingProfiles.0.RoutingProfileArn')
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}GetRoutingProfile`)
            };

            return new cr.AwsCustomResource(this.scope, `${this.scope}GetRoutingProfile${this.getRandomString()}`, {
                onCreate: searchRoutingProfileInput,
                onUpdate: searchRoutingProfileInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [props.connect_instance.attrArn,
                        `${props.connect_instance.attrArn}/*`],
                    }),
                ]),
            });
        }

        public getSecurityProfileForName(props: GetSecurityProfileProps) {
            const securityProfileInput = {
                service: 'Connect',
                action: 'SearchSecurityProfilesCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    MaxResults: 1,
                    SearchCriteria: {
                        StringCondition: {
                            FieldName: "name",
                            Value: props.securityProfileName,
                            ComparisonType: "EXACT",
                        }
                    }
                },
                // physicalResourceId: cr.PhysicalResourceId.fromResponse('SecurityProfiles.0.SecurityProfileId')
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}GetSecurityProfile`)
            }

            return new cr.AwsCustomResource(this.scope, `${this.scope}GetSecurityProfile${this.getRandomString()}`, {
                onCreate: securityProfileInput,
                onUpdate: securityProfileInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [props.connect_instance.attrArn,
                        `${props.connect_instance.attrArn}/*`],
                    }),
                ]),
            });

        }

        public createUser(props: CreateUserProps): CfnUser {

            return new cdk.aws_connect.CfnUser(this.scope, `${this.scope}CfnUser${props.cdkConstructId}`, {
                instanceArn: props.connect_instance.attrArn,
                phoneConfig: {
                    phoneType: 'SOFT_PHONE',
                },
                routingProfileArn: props.routingProfileArn,
                securityProfileArns: props.securityProfileArns,
                username: props.username,
                identityInfo: {
                    firstName: props.firstName,
                    lastName: props.lastName,
                    email: props.email
                },
                password: props.password
            });

        }

        public searchUserForUsername(props: UserProps): cr.AwsCustomResource {
            const searchUserInput = {
                service: 'Connect',
                action: 'SearchUsersCommand',
                parameters: {
                    InstanceId: props.connect_instance.attrArn,
                    MaxResults: 1,
                    SearchCriteria: {
                        StringCondition: {
                            FieldName: "username",
                            Value: props.username,
                            ComparisonType: "EXACT",
                        }
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}SearchUsers`)
            }

            return new cr.AwsCustomResource(this.scope, `${this.scope}SearchUsers`, {
                onCreate: searchUserInput,
                onUpdate: searchUserInput,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [props.connect_instance.attrArn,
                        `${props.connect_instance.attrArn}/*`],
                    }),
                ]),
            });
        }

        public createRule(props: CreateRuleProps) {
            const ruleFunction = {
                Version: "2022-11-25",
                RuleFunction: {
                    Operator: "OR",
                    Operands: [
                        {
                            Operator: "CONTAINS_ANY",
                            Operands: props.queueIdList,
                            ComparisonValue: "$.ContactLens.PostCall.Queue.QueueId",
                            Negate: false,
                        },
                        {
                            Operator: "CONTAINS_ANY",
                            Operands: props.agentIdList,
                            ComparisonValue: "$.ContactLens.PostCall.Agent.AgentId",
                            Negate: false,
                        },
                    ],
                },
            };

            const rule = new CfnRule(this.scope, `${this.scope}CfnRule`, {
                actions: {
                    assignContactCategoryActions: [{}],
                    eventBridgeActions: [
                        {
                            name: props.eventBridgeActionRuleName,
                        },
                    ],
                },
                function: JSON.stringify(ruleFunction),
                instanceArn: props.connect_instance.attrArn,
                name: props.ruleName,
                publishStatus: "PUBLISHED",
                triggerEventSource: {
                    eventSourceName: "OnPostCallAnalysisAvailable",
                },

            });
        }

        public addApprovedOriginDomain(id: string, props: ApprovedDomainProps) {
            const associateOriginInput = {
                service: 'Connect',
                action: 'AssociateApprovedOriginCommand',
                parameters: {
                    InstanceId: props.instanceArn,
                    Origin: props.origin
                },
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}AssociateApprovedOrigin${id}`)
            };

            const describeInstance = new cr.AwsCustomResource(this.scope, `${this.scope}AssociateApprovedOrigin${id}`, {
                onCreate: associateOriginInput,
                onUpdate: associateOriginInput,

                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [
                            props.instanceArn,
                            `${props.instanceArn}/*`],
                    }),
                ]),
            });
        }


        public updateAgentSecurityProfile(props: UpdateAdminSecurityProfileProps) {
            const searchSecurityProfile = {
                service: 'Connect',
                action: 'SearchSecurityProfilesCommand',
                parameters: {
                    InstanceId: props.instanceArn,
                    MaxResults: 1,
                    SearchCriteria: {
                        StringCondition: {
                            FieldName: "name",
                            Value: "Agent",
                            ComparisonType: "EXACT",
                        }
                    }
                },
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}SearchSecurityProfile`)
            }

            const searchSecurityProfileResult = new cr.AwsCustomResource(this.scope, `${this.scope}SearchSecurityProfile`, {
                onCreate: searchSecurityProfile,
                onUpdate: searchSecurityProfile,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [
                            props.instanceArn,
                            `${props.instanceArn}/*`
                        ],
                    }),
                ]),
            });

            const agentSecurityProfileId = searchSecurityProfileResult.getResponseField("SecurityProfiles.0.Id")

            const updateSecurityProfile = {
                service: 'Connect',
                action: 'UpdateSecurityProfileCommand',
                parameters: {
                    InstanceId: props.instanceArn,
                    SecurityProfileId: agentSecurityProfileId,
                    //upate permissions: https://docs.aws.amazon.com/connect/latest/adminguide/security-profile-list.html
                    Permissions: [
                        //Contact Control Panel (CCP)
                        "BasicAgentAccess",
                        "RealtimeContactLens.View",
                        "OutboundCallAccess",
                        "VoiceId.Access",
                        "AudioDeviceSettings.Access",
                        "VideoContact.Access",
                        //Analytics and Optimization
                        "MyContacts.View",
                        "GraphTrends.View",
                        "ContactLensPostContactSummary.View",
                        "ListenCallRecordings",
                        "DownloadCallRecordings"

                    ]
                },
                physicalResourceId: cr.PhysicalResourceId.of(`${this.scope}UpdateAgentSecurityProfile`)
            }

            return new cr.AwsCustomResource(this.scope, `${this.scope}UpdateAgentSecurityProfile`, {
                onCreate: updateSecurityProfile,
                onUpdate: updateSecurityProfile,
                policy: cr.AwsCustomResourcePolicy.fromStatements([
                    new PolicyStatement({
                        actions: ["connect:*"],
                        resources: [
                            props.instanceArn,
                            `${props.instanceArn}/*`
                        ],
                    }),
                ]),
            });
        }

        //utilty to get random string of lenght 5 for concurrent cloudformation constructs
        private getRandomString(): string {
            return Math.random().toString(36).substring(2, 7);
        }
    }
}
