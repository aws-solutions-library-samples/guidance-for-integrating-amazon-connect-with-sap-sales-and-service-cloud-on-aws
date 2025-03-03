/**
 * Extends the contact events.
*/
export default function (contact) {
    console.debug("CDEBUG >> ContactEvents - New Contact contactId: " + contact.contactId);
    console.debug("CDEBUG >> ContactEvents - New Contact InitialContactId(): " + contact.getInitialContactId());

    // Route to the respective handler
    contact.onIncoming(handleContactIncoming);
    contact.onAccepted(handleContactAccepted);
    contact.onConnecting(handleContactConnecting);
    contact.onConnected(handleContactConnected);
    contact.onEnded(handleContactEnded);
    contact.onDestroy(handleContactDestroyed);
    contact.onMissed(handleContactMissed);

    function handleContactIncoming(contact) {
        console.debug('CDEBUG >> ContactEvents.handleContactIncoming');
    }

    function handleContactAccepted(contact) {
        console.debug('CDEBUG >> ContactEvents.handleContactAccepted - Contact accepted by agent');
        // Add your custom code here

        var messageObject = {
            EventType: "INBOUND",
            ActionTemp: "ACCEPT"
        }

        createPayload(messageObject, contact);

    }

    function handleContactConnecting(contact) {
        console.debug('CDEBUG >> V2.0 ContactEvents.handleContactConnecting() - Contact connecting to agent');
        // Add your custom code here
        var messageObject = {
            EventType: "INBOUND",
            Action: "NOTIFY"
        }

        createPayload(messageObject, contact);

    }

    function handleContactConnected(contact) {
        console.debug('CDEBUG >> ContactEvents.handleContactConnected() - Contact connected to agent');

    }

    function handleContactEnded(contact) {
        console.debug('CDEBUG >> ContactEvents.handleContactEnded() - Contact has ended successfully');
        // Add your custom code here
        var messageObject = {
            EventType: "UPDATEACTIVITY",
            Action: "END"
        }

        createPayload(messageObject, contact);

    }

    function handleContactDestroyed(contact) {
        console.debug('CDEBUG >> ContactEvents.handleContactDestroyed() - Contact will be destroyed');
        // Add your custom code here
    }

    function handleContactMissed(contact) {
        console.debug('CDEBUG >> ContactEvents.handleContactMissed() - Contact was missed');
    }

    function createPayload(messageObject, contact) {

        // Extract attributes
        var contactAttr = contact.getAttributes()

        var messageObjectTemp = {};
        Object.values(contactAttr).forEach((attribute) => {
            let attrName = attribute.name;
            let attrValue = attribute.value;
            messageObjectTemp[attrName] = attrValue;
        })

        // Handle Message Object Type
        if (messageObjectTemp['Channel'] == 'VOICE') {
            messageObject['Type'] = 'CALL';
            // Handle ANI
            messageObject['ANI'] = messageObjectTemp['ANI'];

            // Handle RecordingID
            // Add Recording ID if message type is NOTIFY
            if (messageObject['ActionTemp']) {
                // check if action is ACCEPT
                if (messageObject['ActionTemp'] == 'ACCEPT') {
                    messageObject['RecordingId'] = contact.contactId;
                }
            }
        }
        else if (messageObjectTemp['Channel'] == 'CHAT') {
            messageObject['Type'] = 'CHAT';
            messageObject['Email'] = "test.user@example.com"

            // check if messageObject has action key
            if (messageObject['Action']) {
                // check if action is END
                if (messageObject['Action'] == 'END') {
                    messageObject['Transcript'] = " ";
                }
            }

        }

        // Handle CAD parameters
        var sendCADParams = false;
        if (messageObject['Action']) {
            // check if action is NOTIFY
            if (messageObject['Action'] == 'NOTIFY') {
                sendCADParams = true;
            }
        }

        if (messageObject['ActionTemp']) {
            // check if action is NOTIFY
            if (messageObject['ActionTemp'] == 'ACCEPT') {
                sendCADParams = true;
            }
        }
        
        if (sendCADParams == true)
            {
                if (messageObjectTemp['CustomerUUID']) {
                    messageObject['Custom_1'] = messageObjectTemp['CustomerUUID'];
                }
                if (messageObjectTemp['TicketID']) {
                    messageObject['Custom_2'] = messageObjectTemp['TicketID'];
                }
                if (messageObjectTemp['Serial']) {
                    messageObject['Custom_3'] = messageObjectTemp['Serial'];
                }
            }

        // Handle ExternalReferenceID
        messageObject['ExternalReferenceID'] = contact.contactId;

        console.debug('CDEBUG >> MessageObject', messageObject);

        var sPayload = "<?xml version='1.0' encoding='utf-8' ?> <payload> ";
        try {

            for (var key in messageObject) {
                var tag = "<" + key + ">" + messageObject[key] + "</" + key + ">";
                sPayload = sPayload + tag;
            }

            sPayload = sPayload + "</payload>";
            if (window.parent !== window.self) {
                window.parent.postMessage(sPayload, "*");
            }
            else {
                console.warn("CDEBUG >> No parent window found. Message not sent.");
            }
            console.debug("CDEBUG >> XML value", sPayload);

        } catch (e) {
            console.error("CDEBUG >> ContactEvents.handleContactConnecting() - Error!! ", e);
        }

    }

}