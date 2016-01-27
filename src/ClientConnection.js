/*********************************************************************
 *                                                                   *
 *   Copyright 2016 Simon M. Werner                                  *
 *                                                                   *
 *   Licensed to the Apache Software Foundation (ASF) under one      *
 *   or more contributor license agreements.  See the NOTICE file    *
 *   distributed with this work for additional information           *
 *   regarding copyright ownership.  The ASF licenses this file      *
 *   to you under the Apache License, Version 2.0 (the               *
 *   "License"); you may not use this file except in compliance      *
 *   with the License.  You may obtain a copy of the License at      *
 *                                                                   *
 *      http://www.apache.org/licenses/LICENSE-2.0                   *
 *                                                                   *
 *   Unless required by applicable law or agreed to in writing,      *
 *   software distributed under the License is distributed on an     *
 *   "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY          *
 *   KIND, either express or implied.  See the License for the       *
 *   specific language governing permissions and limitations         *
 *   under the License.                                              *
 *                                                                   *
 *********************************************************************/

'use strict';

var messageHandler = require('./messageHandler');

var EventEmitter = require('events').EventEmitter;
var util = require('util');

/**
 * The connection manager will handle the TCP and UDP transport.  As well as
 * the protocol.
 */
function ClientConnection(options) {

    if (options.udp4 === true && options.tcp === true) {
        throw new Error('Both udp and tcp are set as protocol.  Devices can only communicate in one protocol.');
    }
    if (options.udp4 === false && options.tcp === false) {
        throw new Error('Niether UDP or TCP is set.  Devices must communicate in one protocol.');
    }

    if (options.udp4) {
        this.createProxySocket('udp4', options.proxyUrl, options.port);
    } else {
        this.createProxySocket('tcp', options.proxyUrl, options.port);
    }

    EventEmitter.call(this);
}
util.inherits(ClientConnection, EventEmitter);

/**
 * Set up the UDP listener.
 */
ClientConnection.prototype.createProxySocket = function (protocol, address, port) {

    this.remoteAddress = address;
    this.remotePort = port;
    var self = this;

    switch (protocol) {
        case 'udp4':
            var dgram = require('dgram');
            this.udp4 = dgram.createSocket('udp4');
            this.udp4.on('error', handleError.bind(this));
            this.udp4.on('message', function (message) {
                handleMessage.bind(self)(message);
            });
            break;

        case 'tcp':
            var net = require('net');

            this.tcp = new net.Socket();
            this.tcp.connect(this.remotePort, this.remoteAddress);
            this.tcp.on('error', handleError.bind(this));
            this.tcp.on('data', handleMessage.bind(this));
            this.tcp.on('close', function() {
                delete self.tcp;
            });
            break;

        default:
            throw new Error('invalid protocol: ', protocol);
    }
};

function handleError(err) {
    console.log(err);
    this.emit('error', err);
}

function handleMessage(message) {

    var msgObj;
    try {
        msgObj = messageHandler.parseIncomingMessage(message);
    } catch (ex) {
        this.emit('error', ex);
        return;
    }

    // Empty packet arrived, this happens when remote closes connection
    if (msgObj === null) {
        return;
    }

    this.emit(msgObj.type, msgObj);

}


/**
 * Close all connections.
 */
ClientConnection.prototype.closeAll = function() {

    if (this.udp4) {
        this.udp4.close();
    }

    if (this.tcp) {
        this.tcp.destroy();
    }

};


/**
 * Sends a message to the remote device.
 * @param  {string} err    The error string
 * @param  {string} address The remote address.
 * @param  {number} remote The remote port.
 */
ClientConnection.prototype.send = function(msgObj) {

    var sendBuffer = messageHandler.packOutgoingMessage(msgObj);

    if (this.udp4) {
        this.udp4.send(sendBuffer, 0, sendBuffer.length, this.remotePort, this.remoteAddress);
        return;
    }

    if (this.tcp) {
        this.tcp.write(sendBuffer);
        return;
    }

    throw new Error('Trying to send a message when a protocol has not been configured.');

};

module.exports = ClientConnection;
