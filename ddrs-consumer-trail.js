import pkg from "@iota/is-client";
const { ChannelClient, ApiVersion, IdentityClient, ChannelType } = pkg;

// Libraries needed to store hashes
import hashJs from "hash.js";
const { sha256 } = hashJs;
import jsonSortify from "json.sortify";

import fs from "fs";

const config = {
  apiKey: "b85e51a2-9981-11ec-8770-4b8f01948e9b",
  isGatewayUrl: "https://demo-integration-services.iota.cafe",
  apiVersion: ApiVersion.v01,
};

// Creates a new identity for a DDRS user
async function createUserIdentity() {
  try {
    // Identity Client
    const identityClient = new IdentityClient(config);
    // Create a new user. The user is used for authentication only.
    const username = "User-" + Math.ceil(Math.random() * 100000);
    const userIdentity = await identityClient.create(username);

    fs.writeFileSync("identity.json", JSON.stringify(userIdentity));

    return userIdentity;
  } catch (error) {
    console.error("Error while creating user identity: ", error);
    throw error;
  }
}

// Creates a new Audit Trail for a DDRS user
async function createAuditTrail(userIdentity, channelClient) {
  try {
    // Create a new channel for sample data
    const auditTrail = await channelClient.create({
      topics: [{ type: "buyer-trail", source: "ddrs" }],
      type: ChannelType.public,
    });

    // The channel address is used to read and write to channels
    const channelAddress = auditTrail.channelAddress;
    console.log(`Buyer Audit Trail Channel address: ${channelAddress}`);

    return auditTrail;
  } catch (error) {
    console.error(
      `Error while creating Audit Trail for ${userIdentity.doc.id}`,
      error
    );
    throw error;
  }
}

// Record buyers events on the audit trail, committing to the data
async function recordEvent(channelClient, auditTrail, event) {
  const hash = sha256().update(jsonSortify(event)).digest("hex");

  await channelClient.write(auditTrail.channelAddress, {
    type: "application/json",
    created: new Date().toISOString(),
    publicPayload: {
      type: "Proof",
      proofValue: hash,
    },
  });
}

// Verifies buyer events through the audit trail
async function verifyEvents(auditTrail, ddrsEvents) {
  const channelClient = new ChannelClient(config);

  // Reading channel
  const presharedKey = "";
  const auditTrailEntries = await channelClient.readHistory(
    auditTrail.channelAddress,
    presharedKey,
    ChannelType.public
  );

  for (let c = 0; c < auditTrailEntries.length; c++) {
    const proof = auditTrailEntries[c].log.publicPayload.proofValue;
    const hash = sha256().update(jsonSortify(ddrsEvents[c])).digest("hex");

    if (proof !== hash) {
      return false;
    }
  }

  return true;
}

async function main() {
  const userIdentity = await createUserIdentity();

  console.log("User DID", userIdentity.doc.id);
  console.log("User Key", JSON.stringify(userIdentity.key));

  const channelClient = new ChannelClient(config);
  await channelClient.authenticate(
    userIdentity.doc.id,
    userIdentity.key.secret
  );

  // A new audit trail
  const channelDetails = await createAuditTrail(userIdentity, channelClient);

  // Consumer event
  const ddrsEvent = {
    gtin: "8410728104102",
    type: "ItemBought",
    quantity: 2,
    depositAmount: 0.2,
  };

  // Consumer event
  const ddrsEvent2 = {
    gtin: "8410728104102",
    type: "ItemReturned",
    quantity: 2,
    returnAmount: 0.2,
  };

  // Recording the event
  console.log(
    "Recording DDRS events on the user's audit trail: ",
    ddrsEvent,
    ddrsEvent2
  );
  await recordEvent(channelClient, channelDetails, ddrsEvent);
  await recordEvent(channelClient, channelDetails, ddrsEvent2);

  const verificationResult = await verifyEvents(channelDetails, [ddrsEvent, ddrsEvent2]);

  console.log("Verification Result: ", verificationResult);
}

main()
  .then(() => console.log("Finished!!!"))
  .catch((err) => console.error(err));
