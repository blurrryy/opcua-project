const { OPCUAClient, AttributeIds, TimestampsToReturn } = require("node-opcua");

const EventEmitter = require("events");

class NodeController {
  constructor(endpoint = null) {
    this.endpoint = null;
    this.client = null;
    this.session = null;
    this.browseReferences = null;
    this.subscription = null;
    this.endpoint = endpoint;
    this.client = OPCUAClient.create({ endpoint_must_exist: false });
  }

  connect() {
    if (!this.endpoint) return Promise.reject(`No endpoint found`);
    if (!this.client) return Promise.reject(`No client found`);
    return new Promise((resolve, reject) => {
      console.log(`Connecting to endpoint ${this.endpoint}`);
      this.client.connect(this.endpoint, (err) => {
        if (err) {
          reject(`Cannot connect to endpoint: ${err}`);
        } else {
          resolve(`Connected`);
        }
      });
    });
  }

  createSession() {
    if (!this.client) return Promise.reject(`No client found`);
    return new Promise((resolve, reject) => {
      this.client.createSession((err, session) => {
        if (!err) {
          this.session = session;
          resolve();
        } else {
          reject(`Could not create session: ${err}`);
        }
      });
    });
  }

  browse() {
    if (!this.session) return Promise.reject(`No active session found`);
    return new Promise((resolve, reject) => {
      this.session.browse("RootFolder", (err, browse_result) => {
        if (!err) {
          if (
            browse_result &&
            browse_result.references &&
            Array.isArray(browse_result.references)
          ) {
            this.browseReferences = browse_result.references;
            resolve();
          } else reject(`Could not find valid references while browsing...`);
        } else {
          reject(`Could not browse: ${err}`);
        }
      });
    });
  }

  createSubscription() {
    if (!this.session) {
      throw `No session set for node ${this.id}`;
    }

    return new Promise((resolve, reject) => {
      this.session.createSubscription2(
        {
          requestedPublishingInterval: 1000,
          requestedLifetimeCount: 1000,
          requestedMaxKeepAliveCount: 20,
          maxNotificationsPerPublish: 10,
          publishingEnabled: true,
          priority: 10,
        },
        (err, subscription) => {
          if (err) {
            reject(`Could not create subscription: ${err}`);
            return;
          }
          this.subscription = subscription;
          this.listenToSubscriptionEvents();
          resolve();
        }
      );
    });
  }

  printBrowsingRefrences() {
    if (!this.browseReferences) {
      throw `Could not find valid browsing refrences...`;
    }
    this.browseReferences.map((x) => console.log(x.browseName));
  }

  listenToSubscriptionEvents() {
    if (!this.subscription) throw `Could not find active subscription`;

    this.subscription.on(`keepalive`, () => {
      console.log(`Subscription Alive`);
    });

    this.subscription.on(`terminated`, () => {
      console.error(`*** ACTIVE SUBSCRIPTION TERMINATED ***`);
    });
  }

  getSession() {
    if (!this.session) throw `No session found`;
    return this.session;
  }

  getSubscription() {
    if (!this.subscription) throw `No active subscription found`;
    return this.subscription;
  }
}

class Node {
  constructor(nodeString, nodeController) {
    this.id = nodeString;
    this.nodeController = null;
    this.session = null;
    this.subscription = null;
    this.screen = null;
    this.nodeController = nodeController;
    this.setActiveSession(nodeController.getSession());
    this.setActiveSubscription(nodeController.getSubscription());
    this.monitorEE = new EventEmitter();
    Node.addNewNode(this);
  }

  setActiveSession(session) {
    this.session = session;
  }

  setActiveSubscription(subscription) {
    this.subscription = subscription;
  }

  readVar() {
    if (!this.session) {
      throw `No session set for node ${this.id}`;
    }
    try {
      return new Promise((resolve, reject) => {
        this.session.read(
          {
            nodeId: this.id,
            attributeId: AttributeIds.Value,
          },
          (err, dataValue) => {
            if (err) {
              reject(err);
              return;
            }
            if (
              dataValue &&
              dataValue.value &&
              dataValue.value.value !== undefined
            )
              console.log(
                `${this.id}: `,
                dataValue.value.value.toString(),
                ` --- at point in time: ---`,
                dataValue.serverTimestamp.toISOString()
              );
            else {
              console.log(`Cannot access dataValue.value.value of ${this.id}`);
              console.log(`Printing raw dataValue output:`);
              console.log(dataValue);
            }
            resolve();
          }
        );
      });
    } catch (err) {
      throw `readVar for ${this.id} encountered an error: ${err}`;
    }
  }

  startMonitoring(silent = false) {
    if (!this.subscription) throw `No active subscripton to monitor ${this.id}`;
    console.log(`Starting to monitor id ${this.id}`);
    return new Promise((resolve, reject) => {
      this.subscription.monitor(
        {
          nodeId: this.id,
          attributeId: AttributeIds.Value,
        },
        {
          samplingInterval: 100,
          discardOldest: true,
          queueSize: 10,
        },
        TimestampsToReturn.Both,
        (err, monitoredItem) => {
          if (err) {
            console.error(`Could not monitor ${this.id}`);
            reject();
          }
          console.log(`Successfully started to monitor ${this.id}`);
          this.screen = monitoredItem;
          this.printMonitorEvents(silent);
          resolve();
        }
      );
    });
  }

  printMonitorEvents(silent) {
    if (!this.screen) {
      console.error(`Nothing to monitor for ${this.id}`);
      return;
    }

    this.screen.on(`changed`, (value) => {
      if (!silent) console.log(`New Change Deteced for ${this.id}`);
      if (value && value.value && value.value.value !== undefined) {
        if (!silent)
          console.log(`[${this.id}] ${value.value.value.toString()}`);
        let eventObject = {
            timestamp: new Date(Date.now()).toISOString(),
            node: this.id,
            value: value.value.value.toString()
        }
        this.monitorEE.emit('change', eventObject);
      } else {
        if (!silent) {
          console.log(
            `No proper sub object found for change, printing raw change value object:`
          );
          console.log(value);
        }
      }
    });

    this.screen.on(`err`, (err) => {
      console.error(`Error while monitoring ${this.id}: ${err}`);
      this.monitorEE.emit('error', {id: this.id, error: err});
    });
  }

  getListener() {
    return this.monitorEE;
  }

  static addNewNode(node) {
      if(!Node.__allNodes) Node.__allNodes = [];
      Node.__allNodes.push(node);
  }

  static returnAllNodes() {
    if(!Node.__allNodes) Node.__allNodes = [];
    return Node.__allNodes;
  }
}

module.exports = {
  NodeController,
  Node,
};
