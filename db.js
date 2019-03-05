'use strict';
const mysql = require('mysql');
const util = require('util');
const log = require('./logger')(module);
var nconf = require('./config')

var db_config = nconf.get('database');

var pool = mysql.createPool(db_config);

const query = util.promisify(pool.query).bind(pool);

var fetchCoins = async (order = 'rank', sort = 'ASC', limit = 100) => {
    let data = await query("SELECT * FROM `coin` ORDER BY `" + order + "` " + sort + " LIMIT " + limit);
    log.debug('fetched coins: ' + data.length)
    return data;
}

var fetchOneCoin = async (symbol) => {
    let data = {};
    let coin = await query("SELECT * FROM `coin` WHERE `symbol` =  ?", [symbol]);
    let info = await query("SELECT * FROM `coin_info` WHERE `symbol` = ? ", [symbol]);

    data.coin = coin[0];
    data.info = info[0];
    log.debug(symbol + ' was fetched');
    return data;
}

var fetchTotal = async () => {
    let data = await query("SELECT * FROM `global` ORDER BY `id` DESC LIMIT 1");
    log.debug('fetched total info: ' + data.length)
    return data[0];
}

var fetchPrices = async () => {
    let data = {}
    let eth = await query("SELECT `price` FROM `coin` WHERE `symbol` = 'ETH'");
    let usdt = await query("SELECT `price_usd` FROM `coin` WHERE `symbol` = 'BTC'");

    data.eth = 1 / eth[0]['price'];
    data.usdt = usdt[0]['price_usd'];

    log.debug('fetched prices: ' + data.length)
    return data
}

var fetchPairs = async (symbol = '', market = '') => {
    if (market) {
        var data = await query("SELECT `symbol`, `main`, `pair`, `price`, `volume_btc`,  `change24h` FROM `coins` WHERE market = ? ORDER BY `volume_btc` DESC", [market]);
        log.debug('Pairs with market: ' + market + ' was fetched');
    } else {
        var data = await query("SELECT `pair`,`main`, `volume_btc`, `change24h`, `market` FROM `coins` WHERE `symbol` = ? OR `main` = ? ORDER BY `volume_btc` DESC", [symbol, symbol]);
        log.debug('Pairs with symbol: ' + symbol + ' was fetched');
    }
    return data;
}

var fetchMarkets = async () => {
    let data = await query("SELECT * FROM `markets` ORDER BY `volume` DESC");

    log.debug('fetched markets: ' + data.length);
    return data;
}

var fetchOneMarket = async (name) => {
    let data = {};

    let market = await query("SELECT * FROM `markets` WHERE `name` = ? ", [name]);
    let uniq = await query("SELECT `main` FROM `coins` WHERE `market` = ? GROUP BY `main`", [market[0].symbol]);

    data = market[0];
    data.uniq = uniq;

    log.debug(name + ' was fetched');
    return data;
}


module.exports = {
    fetchCoins,
    fetchTotal,
    fetchPrices,
    fetchOneCoin,
    fetchPairs,
    fetchMarkets,
    fetchOneMarket
}
