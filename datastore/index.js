// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: apiconnect-microgateway
// US Government Users Restricted Rights - Use, duplication or disclosure
// restricted by GSA ADP Schedule Contract with IBM Corp.

'use strict'

var Promise = require('bluebird');
var logger = require('apiconnect-cli-logger/logger.js')
               .child({loc: 'apiconnect-microgateway:datastore'});
var forever = require('forever-monitor');

var child;
var server;
var sigtermHandler = function() {
                       child.kill(true);
                       process.exit(0);
                     };

exports.start = function(fork) {
  return new Promise(function(resolve, reject) {
    if (fork) {
      child = new (forever.Monitor)('./datastore/server/server.js', {
        max: 10,
        args: [],
        fork: true,
        killTree: true,
      });

      child.on('restart', function() {
        logger.debug('datastore restarting, count=' + child.times);
      });

      child.on('exit', function() {
        logger.debug('datastore exited');
      });

      var dataStorePort, https = false, loaded = false;
      child.on('message', function(msg) {
        if (msg.DATASTORE_PORT != null) {
          dataStorePort = msg.DATASTORE_PORT;
        }
        if (msg.LOADED != null) {
          if(!msg.LOADED) {
            reject(Error('failed to load datastore'));
            return;
          }
          loaded = true;
        }
        if (msg.https != null) {
          https = msg.https;
        }
        // waiting for both events, seen scenario where
        // they come out of order..
        if (loaded && dataStorePort) {
          child.removeAllListeners('message');
          process.env.DATASTORE_PORT = dataStorePort;
          resolve(https);
        }
      });

      child.on('stderr', function(data) {
        process.stderr.write(data);
      });

      child.on('stdout', function(data) {
        process.stdout.write(data);
      });

      child.on('disconnect', function() {
        process.exit(2);
      });

      child.start();

    } else {
      process.send = function(msg) {
        var https = false, loaded = false;
        if (msg.https != null) {
          https = msg.https;
        }

        if (msg.LOADED != null) {
          process.send = function() {};
          if (!msg.LOADED) {
            reject(Error('failed to load datastore'));
          } else {
            resolve(https);
          }
        }
      };
      server = require('./server/server.js');
      server.start();
    }
  });
};

exports.stop = function() {
  return new Promise(function(resolve, reject) {
    if (child) {
      child.on('exit', function() {
        child = undefined; // reset child
        resolve();
      });
      child.stop();
    }
    if (server) {
      server.close(function() {
        server = undefined; // reset server
        resolve();
      });
    }
  });
};

