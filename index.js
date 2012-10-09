
/**
 * Module dependencies.
 */

var Socket = require('engine.io-client').Socket
  , Document = require('./document')
  , debug = require('debug')('mydb-client')
  , Emitter, json;

try {
  Emitter = require('emitter');
  json = require('json');
} catch(e) {
  Emitter = require('emitter-component');
  json = require('json-component');
}

/**
 * Module exports.
 */

module.exports = Manager;

/**
 * Manager constructor.
 *
 * @param {String|Object} optional, url to connect socket to or eio opts
 * @api public
 */

function Manager(url){
  if (!(this instanceof Manager)) return new Manager(url);
  var self = this;
  this.socket = new Socket(url);
  this.socket.onopen = this.onOpen.bind(this);
  this.socket.onclose = this.onClose.bind(this);
  this.socket.onmessage = this.onMessage.bind(this);
  this.connected = false;
  this.subscriptions = {};
}

/**
 * Mixes in `Emitter`.
 */

Emitter(Manager.prototype);

/**
 * Called upon upon open.
 *
 * @api private
 */

Manager.prototype.onOpen = function(){
  debug('mydb-client socket open');
  this.connected = true;
  this.emit('connect');
};

/**
 * Called upon upon close.
 *
 * @api private
 */

Manager.prototype.onClose = function(){
  debug('mydb-client socket closed');
  this.connected = false;
  this.emit('disconnect');
};

/**
 * Called when a message is received.
 *
 * @api private
 */

Manager.prototype.onMessage = function(msg){
  var obj = json.parse(msg);
  var sid = obj.i;

  if (!this.subscriptions[sid] && obj.d) {
    debug('ignoring data for inexisting subscription %s', sid);
    return;
  }

  switch (obj.e) {
    case 'p': // payload
      this.emit('payload', sid, obj.d);
      break;

    case 'o': // operation
      this.emit('op', sid, obj.d);
      break;

    case 'u': // unsubscribe confirmation
      this.emit('unsubscribe', sid);
      break;
  }
};

/**
 * Subscribes to the given sid.
 *
 * @param {String} id
 * @api private
 */

Manager.prototype.subscribe = function(id, doc){
  // keep count of the number of references to this subscription
  this.subscriptions[id] = (this.subscriptions[id] || 0) + 1;

  // we subscribe to the server upon the first one
  if (1 == this.subscriptions[id]) {
    this.write({ e: 'subscribe', i: id });
    this.emit('subscription', doc);
  }
};

/**
 * Writes the given object to the socket.
 *
 * @api private
 */

Manager.prototype.write = function(obj){
  this.socket.send(json.stringify(obj));
};

/**
 * Destroys a subscription.
 *
 * @param {String} subscription id
 * @api private
 */

Manager.prototype.unsubscribe = function(id){
  // check that the subscription exists
  if (!this.subscriptions[id]) {
    throw new Error('Trying to destroy inexisting subscription: ' + id);
  }

  // we substract from the reference count
  var subs = --this.subscriptions[id];

  // if no references are left we unsubscribe from the server
  if (!subs) {
    delete this.subscriptions[id];
    this.write({ e: 'unsubscribe', i: id });
    this.emit('destroy', id);
  }
};

/**
 * Retrieves a document.
 *
 * @return {Document}
 * @api public
 */

Manager.prototype.get = function(url, fn){
  var doc = new Document(this);

  if (url) {
    if (this.connected) {
      load();
    } else {
      this.once('connect', load);
    }
  }

  function load(){
    doc.load(url, fn);
  }

  return doc;
};
