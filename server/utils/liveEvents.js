const { EventEmitter } = require('events');
const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(50); // headroom for multiple open SSE connections
module.exports = liveEvents;