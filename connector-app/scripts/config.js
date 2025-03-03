// config.js
const config = {
    //the configuration of the Amazon Connect instance in which the Amazon Connect has been created
    amazonconnect: {
        //the AWS region in which the Amazon Connect has been provisioned
        region: "{{ region }}",
        // the Access URL of the Amazon Connect instance
        accessURL: "{{ accessURL }}",
    }
};

export default config;