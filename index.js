'use strict';
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const SSP = require('../lib/SSP')

/* GET home page. */

router.use(function (req, res, next) {
    let url = req.baseUrl

    switch (url) {
        case '':
            req.setLocale('en')
            break
        case '/ru':
            req.setLocale('ru')
            break
        default:
            req.setLocale('en')
    }
        
    
    next()
});

router.get('/', async (req, res,next) => {
    try {
        var data = db.fetchCoins();
        var total = db.fetchTotal();
        var prices = db.fetchPrices();

        var datas = await Promise.all([data, total, prices]).then(value => {
            return value
        })
    } catch (err) {
        next(err)
    }

    data = datas[0]
    total = datas[1]
    prices = datas[2]

    var coins = [];

    data.forEach(function (item) {
        let coin = {}

        coin.rank = item.rank;
        coin.name = (item.name) ? item.name : item.symbol.toUpperCase();
        coin.img = item.logo;
        coin.symbol = item.symbol.toLowerCase();
        coin.price = item.price;
        coin.priceUsd = (item['price_usd'] < 0.01) ? item['price_usd'] : item['price_usd'].toFixed(2)
        coin.cap = (!item.cap) ? '-' : item.cap
        coin.capUsd = (!item['cap_usd']) ? 0 :
            (item['cap_usd'] >= 1000000000) ? (item['cap_usd'] / 1000000000).toFixed(2) + 'B' :
                (item['cap_usd'] / 1000000).toFixed(2) + 'M'
        coin.change = (item.change24h >= 0) ? '+' + item.change24h + '%' : item.change24h + '%';
        coin.volume = item.volume;
        coin.volumeUsd = (item['volume_usd'] >= 10000) ? (item['volume_usd'] / 1000000).toFixed(2) + 'M' : (item['volume_usd'] / 1000).toFixed(3) + 'K'
        coin.color = (item.change24h >= 0) ? 'up' : 'down';

        coins.push(coin);
    })

    total.volumeUsd = (total['volume_usd'] >= 1000000000) ? (total['volume_usd'] / 1000000000).toFixed(2) + 'B' : (total['volume_usd'] / 1000000).toFixed(2)
    total.capUsd = (total['cap_usd'] >= 1000000000) ? (total['cap_usd'] / 1000000000).toFixed(2) + 'B' : (total['cap_usd'] / 1000000).toFixed(2) + 'M'

    res.render('index', { title: 'Express', coins: coins, total: total, prices: prices });
    
});

router.get('/markets', async (req, res, next) => {
    try {
        var prices = db.fetchPrices();
        var data = db.fetchMarkets();

        var markets = await Promise.all([prices, data]).then(value => {
            return value
        })
    } catch (err) {
        next(err)
    }
    res.render('markets', { title: 'Express', markets: markets[1], prices: markets[0] });
})

router.route('/coins')
    .get(async (req, res, next) => {
        try {
            var prices = await db.fetchPrices();
            var data = await db.fetchCoins();
        } catch (err) {
            next(err)
        }

        var coins = [];

        data.forEach(function (item) {
            let coin = {}

            coin.rank = item.rank;
            coin.name = (item.name) ? item.name : item.symbol.toUpperCase();
            coin.symbol = item.symbol.toLowerCase();
            coin.price = item.price;
            coin.priceUsd = (item['price_usd'] < 0.01) ? item['price_usd'] : item['price_usd'].toFixed(2)
            coin.cap = (!item.cap) ? '-' : item.cap
            coin.capUsd = (!item['cap_usd']) ? 0 : item['cap_usd'].toFixed(0)
            coin.change = (item.change24h >= 0) ? '+' + item.change24h + '%' : item.change24h + '%';
            coin.volume = item.volume;
            coin.volumeUsd = (item['volume_usd'] >= 10000) ? (item['volume_usd'] / 1000000).toFixed(2) + 'M' : (item['volume_usd'] / 1000).toFixed(3) + 'K'
            coin.color = (item.change24h >= 0) ? 'up' : 'down';

            coins.push(coin);
        })

        res.render('coins', { title: 'Coins', prices: prices, coins:coins });
    })
    .post(async (req, res,next) => {
        var columns = [
            { 'db' : 'rank', 'dt': 0 },
            { 'db' : 'symbol', 'dt' : 1 },
            { 'db' : 'price_usd', 'dt' : 2 },
            { 'db' : 'cap_usd', 'dt' : 3},
            { 'db' : 'change24h', 'dt' : 4 },
            { 'db': 'volume_usd', 'dt': 5 },
            { 'db': 'logo', 'dt': 6 },
            { 'db' : 'price', 'dt' : 7 },
            { 'db': 'cap', 'dt': 8 },
            { 'db': 'volume', 'dt': 9}

        ]
       
        var data = await SSP.simple(req.body, 'coin', 'rank', columns).catch(err => {next(err)})
        console.log(data)
        res.send(data)
    })

router.get('/coins/:symbol', async (req, res, next) => {
    let symbol = req.params.symbol;
    let data = {};
    let markt = new Map();
    try {
        var prices =  db.fetchPrices();
        var coin =  db.fetchOneCoin(symbol);
        var pairs =  db.fetchPairs(symbol);
        var markets =  db.fetchMarkets();

        let data = await Promise.all([prices, coin, pairs, markets])

        prices = data[0]
        coin = data[1]
        pairs = data[2]
        markets = data[3]
    } catch (err) {
        next(err)
    }
    data.name = (coin.coin.name) ? coin.coin.name : coin.coin.symbol;
    data.fullName = (coin.coin.name) ? coin.coin.name + ' (' + coin.coin.symbol + ')' : coin.coin.symbol;
    data.symbol = coin.coin.symbol.toLowerCase();
    data.change = (coin.coin.change24h >= 0) ? '+' + coin.coin.change24h : coin.coin.change24h
    data.priceUsd = (coin.coin['price_usd'] < 0.01) ? coin.coin['price_usd'] : coin.coin['price_usd'].toFixed(2)
    data.volumeUsd = (coin.coin['volume_usd'] >= 10000) ? (coin.coin['volume_usd'] / 1000000).toFixed(2) + 'M' : (coin.coin['volume_usd'] / 1000).toFixed(3) + 'K'
    data.capUsd = (!coin.coin['cap_usd']) ? 0 : coin.coin['cap_usd'].toFixed(0)
    data.info = coin.info
    data.color = (coin.coin.change24h >= 0) ? 'up' : 'down'

    markets.forEach(function (item) { 
        markt.set(item.symbol,item.name)
    })


    res.render('coin', { title: 'Express', data: coin, pairs:pairs, prices: prices, coin:data, markets:markt });
})

router.get('/markets/:name', async (req, res,next) => {
    let name = req.params.name;

    try {
        var prices = await db.fetchPrices();
        var data = await db.fetchOneMarket(name);
        var pairs = await db.fetchPairs(undefined, data.symbol)
    } catch (err) {
        next(err)
    }

    data.volumeUsd = (data['volume_usd'] >= 10000) ? (data['volume_usd'] / 1000000).toFixed(2) + 'M' : (data['volume_usd'] / 1000).toFixed(3) + 'K'
    
    res.render('market', { title: 'Express', market: data, pairs: pairs, prices: prices });
})



module.exports = router;
