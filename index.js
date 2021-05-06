const {Node, NodeController} = require('./lib/nodes');
const CONFIG = require("./config.js");

(async () => {
    try {
      let nodeController = new NodeController(CONFIG.opcServer); // Config controller
      await nodeController.connect(); // Connect
      await nodeController.createSession(); // Get active session
    //   await nodeController.browse();
    //   nodeController.printBrowsingRefrences();
      await nodeController.createSubscription(); // Subscribe to active session
  
      let nodes = CONFIG.nodesList;
  
      nodes = nodes.map((x) => new Node(x, nodeController));
  
    //   console.log(`Trying to read vars`);
    //   for (let node of nodes) {
    //     await node.readVar();
    //   }
  
      console.log(`Starting to monitor nodes...`);
      for (let node of nodes) {
        await node.startMonitoring(true); // Listen silent
      }

      // Listen to active events to write them to db
      // This could be also done in the loop before
      // To make it easier, a static method has been set up to get all nodes

      for(let node of Node.returnAllNodes()) { // the same as let node of nodes
        let listener = node.getListener();
        listener.on('change', data => {
            console.log(data); // return change as formatted, timed, JS-Object

            // push to db here...
        })
      }
    } catch (err) {
      console.error(`Function failed with error: ${err}`);
    }
  })();
  