export interface CommonParameters{
    environment: string,
    region: string
}

export interface User {
        username: string,
        email: string,
        firstName: string,
        lastName: string,
        password: string,
}

export interface ConnectParameters extends CommonParameters {
    instanceAlias: string,
    // phoneNumberCountryCode: string,
    bucketName: string,
    eventBridgeRuleName: string,
    users: {
        administrator: User,
        agent: User
    },
}

export interface ConnectorAppParameters extends CommonParameters{
    bucketName: string,
    connectInstanceAccessUrl: string,
    queueArn: string
}


export interface LambdaParameters extends CommonParameters{
    bucketName: string,
    ssmRootParameterName: string,
    environment: string,
    c4cBaseUrl: string,
    c4cPhoneServiceEndpointPath: string,
    c4cUsername: string,
    c4cPassword: string,
}

export interface PostInstallParameters{
    connectorApplicationUrl: string,
    connectInstanceArn: string,
    c4cBaseUrl: string

}