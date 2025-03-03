import initializeCCP from './initCCP.js';
import config from './config.js';
// Add the call to init() as an onload so it will only run once the page is loaded
window.onload = (event) => {
    console.log("window.onload")

    try {
        initializeCCP('container-div');
    } catch (error) {
        console.error('CCP initialization error', error);
    }

};

window.addEventListener("message", (event) => {

    if (!event.data.Direction && !event.data.RecordingId) return;

    const payload = event.data;

    if (payload.RecordingId) {
        var url = `${config.amazonconnect.accessURL}/contact-trace-records/details/` + payload.RecordingId + '?tz=America/New_York';
        console.debug("CDEBUG >> URL value", url);
        var popupWindow = window.open(url, '_blank');
    }

    if (payload.Direction == "OUT") {
        console.debug("CDEBUG >> Direction value", payload.Direction);
        // TODO make the phone call https://github.com/amazon-connect/amazon-connect-streams/blob/master/Documentation.md#agentconnect

        // Remove spaces and dashes
        var phoneNumber = payload.PhoneNumber.replace(/\s|-/g, '');

        var endpoint = connect.Endpoint.byPhoneNumber(phoneNumber);
        var agent = new connect.Agent();

        agent.connect(endpoint, {
            success: function () { console.log("CDEBUG >> outbound call connected"); },
            failure: function (err) {
                console.log("CDEBUG >> outbound call connection failed");
                console.log(err);
            }
        });

    }

}
);
