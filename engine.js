'use strict';
const mysql = require('mysql');
const util = require('util');
const log = require('../lib/logger')(module);
const ccxt = require('ccxt');
const fs = require('fs');

// connecting to db
var db_config = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test'
};

var pool = mysql.createPool(db_config);
var query = util.promisify(pool.query).bind(pool);


var exchanges = [
    'binance',
    'exmo',
    'bitfinex',
    'hitbtc2',
    'bittrex',
    'coss',
    'upbit',
    'yobit',
    'poloniex',
    'livecoin',
    'kucoin',
    'cryptopia',
    'coinexchange',
    'coinbase',
    'bitmex',
    'kraken',
    'okex',
    'zb',
    'bitz',
    'bibox',
    'bitbay',
    'bitlish',
    'bitstamp',
    'bleutrade',
    'bitmarket',
    'bitmex',
    'lbank',
    'huobipro',
    'cryptopia',
    'deribit',

]

var getData = async function (exchangeId)  {
    
    const exchange = new ccxt[exchangeId]({ enableRateLimit: true });
    //let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    var quoteCoins = new Set();
    var allCoins = []

    if (exchange.has['fetchTickers']) {
        try {
            var tickers = await exchange.fetchTickers()
        } catch (err) {
            log.error(exchangeId + ' ' + err)
            return
        }

        //insert
        var arr = []

        for (let item in tickers) {
            let pair = tickers[item].symbol

            let splited = tickers[pair].symbol.split('/');

            let symbol = splited[0]
            let main = splited[1]
            let price = tickers[pair].last
            let volume = (!tickers[pair].quoteVolume && tickers[pair].baseVolume) ? tickers[pair].baseVolume * price : tickers[pair].quoteVolume 
            let change = tickers[pair].percentage
            let market = exchangeId

            arr.push([symbol, main, pair, price, volume, change, market])

            allCoins.push({ symbol: symbol, main: main, price: price })

            quoteCoins.add(main)
        }
        if (arr.length > 0) {
            try {
                await query("INSERT INTO `coins` (`symbol`, `main`, `pair`, `price`,  `volume`, `change24h`, `market`) VALUES ? ON DUPLICATE KEY UPDATE " +
                    "`symbol`=VALUES(symbol), `main`=VALUES(main), `pair`=VALUES(pair), `price`=VALUES(price), `volume`=VALUES(volume), " +
                    "`change24h`=VALUES(change24h),`market`=VALUES(market) ", [arr])
            } catch (err) {
                log.error(exchangeId + ' ' + err + '\n' + err.sql)
                return
            }
             
        }

        //calc base prices
        let prices = await find(allCoins, 'BTC', quoteCoins)
        let stack = []
        for (let data of prices) {
            let price = data[1]

            stack.push(query("UPDATE `coins` SET `price_btc` = price * ?, `volume_btc` = volume * ? WHERE `main` = ? AND `market` = ?", [price, price, data[0], exchangeId]))
        }

        Promise.all(stack).then(value => {
            log.debug(exchangeId + ' Done')
        }, err => {
            log.error(exchangeId +' : \n'+  err)
        })
    }
    
}

var calc = async function()  {
    var coins = await query("SELECT DISTINCT `symbol` FROM `coins`")
    var usdPrice = await query("SELECT AVG(price_btc) AS `price` FROM `coins` WHERE `symbol` IN (?, ?) AND `volume_btc` > 5", ['USD', 'USDT'])
    var data = []
    var stack = []

    //coins
    for (let i in coins) {
        let symbol = coins[i].symbol
        let usd = usdPrice[0].price
        
        stack.push(
            query("SELECT SUM(volume_btc) AS `vol`, AVG(price_btc) AS `price`, AVG(change24h) AS `change` FROM `coins` WHERE `symbol` = ? AND `volume_btc` > 5", [symbol])
                .then(coin => {
                    if (!coin[0].vol || !coin[0].price) {
                    return
                    }

                    let vol = coin[0].vol.toFixed(8)
                    let price = coin[0].price.toFixed(8)
                    let change = (coin[0].change) ? coin[0].change.toFixed(6) : 0

                    let priceUsd = (+usd) ? (price / usd).toFixed(6) : null
                    let volUsd = (+usd) ? (vol / usd).toFixed(0) : null

                    data.push([symbol, price, priceUsd, vol, volUsd, change])  
                }, err => {
                    log.error(err)
        }))
    }

    await Promise.all(stack).then(async() => { 
        query("INSERT INTO `coin` (`symbol`, `price`, `price_usd`, `volume`, `volume_usd`, `change24h`) VALUES ? ON DUPLICATE KEY UPDATE " +
            "`symbol`=VALUES(symbol), `price`=VALUES(price), `price_usd`=VALUES(price_usd), `volume`=VALUES(volume), `volume_usd`=VALUES(volume_usd), `change24h`=VALUES(change24h)," +
            "cap = circulating_supply * price, cap_usd = circulating_supply * price_usd", [data])
            .catch(err => {
                log.error(err)
            })

        log.debug('coins: ' + data.length)
    },
    err => {
        log.error(err)
    })

    //markets
    var markets = await query("SELECT DISTINCT `market` FROM `coins`").catch(err => {
        log.error(err)
    })
    stack = []
    data = []

    for (let i in markets) {
        stack.push(query("SELECT SUM(volume_btc) AS `volume`, COUNT(symbol) AS `pairs`,`market` FROM `coins` WHERE `market` = ?", [markets[i].market]))
    }

    await Promise.all(stack)
        .then(value => {
            for (let i of value) {
                let market = i[0]
                let usd = usdPrice[0].price
                let volUsd = (+usd) ? market.volume / usd : null

                data.push([market.market, market.pairs, market.volume, volUsd])
            }
        }, err => {
            log.error(err)
        })

    await query("INSERT INTO `markets` (`symbol`, `pairs`, `volume`, volume_usd) VALUES ? ON DUPLICATE KEY UPDATE " +
        "`symbol`=VALUES(symbol), `pairs`=VALUES(pairs), `volume`=VALUES(volume), `volume_usd`=VALUES(volume_usd)", [data])
        .then(value => {
            log.debug('markets: ' + value.message)
        },err => {
            log.error('markets:' + err)
            log.error(err.sql)
        })

    //global data
    query("INSERT INTO `global` (`coins`, `markets`, `cap`, `volume`, `cap_usd`, `volume_usd`) " +
        "SELECT coins, markets, cap, volume, cap_usd, volume_usd FROM " +
        "(SELECT COUNT(symbol) as `markets`, SUM(volume) as `volume`, SUM(volume_usd) as `volume_usd` FROM `markets`)A " +
        "JOIN(SELECT COUNT(symbol) as `coins`, SUM(cap) as `cap`, SUM(cap_usd) as `cap_usd`FROM`coin`)B")
            .then(ok => {
                log.debug("Calc Done")
            },err => {
                log.error(err.message)
                log.error(err.sql)
            })
    
}

var rate = async function () {
    try {
        var coins = await query("SELECT `symbol`, `cap`, volume FROM `coin`")
        var markets = await query("SELECT `symbol`, `volume` FROM `markets`")
    } catch (err) {
        log.error(err.message)
        log.error(err.sql)
        return
    }
    var sorting = function (a, b) {
        if (a.cap || b.cap) {
            if (a.cap < b.cap) return 1;
            if (a.cap > b.cap) return -1;
        } else if (!a.cap || !b.cap) {
            if (a.volume < b.volume) return 1;
            if (a.volume > b.volume) return -1;
        } else if (a.cap || !b.cap) {
            return -1
        } else  {
            return 1
        }
    }

    coins.sort(sorting)
    markets.sort(sorting)

    coins.forEach(function (item,i) {
        query("UPDATE `coin` SET `rank` = ? WHERE `symbol` = ?", [i + 1, item.symbol]).catch(err => {
            log.error(err)
        })
    })
    markets.forEach(function (item, i) {
        query("UPDATE `markets` SET `rank` = ? WHERE `symbol` = ?", [i + 1, item.symbol]).catch(err => {
            log.error(err)
        })
    })
    log.debug("Rate DONE")
}

var getAllData = function () {
    let arr = []

    for (let exchange of this.exchanges) {
        arr.push(this.getData(exchange))
    }
    
    return Promise.all(arr).then(value => {
        log.debug('All data was fetched')
    })
}

var getImages = function () {

    fs.readdir('public\\img\\coins\\', function (err, files) {
        for (let item in files) {
            let exp = files[item].split('.')

            if (exp && exp[1] == 'svg') {
                query("UPDATE `coin` SET `logo` = ? WHERE `symbol` = ? ", [files[item], exp[0]])
            }
        }
    })

    fs.readdir('public\\img\\markets\\', function (err, files) {
        for (let item in files) {
            let exp = files[item].split('.')

            if (exp && exp[1] == 'svg') {
                query("UPDATE `markets` SET `logo` = ? WHERE `symbol` = ? ", [files[item], exp[0]]).catch(err => {
                    log.error(err)
                })
            }
        }
    })

    
}

var createSpark = async function (markets) {
    var coins = await query('SELECT DISTINCT `symbol` FROM `coin` ORDER BY `rank` ASC LIMIT 110').catch(error => {
        log.error(error)
    })
    var markets = await query('SELECT DISTINCT `symbol` FROM `markets` ORDER BY `volume` DESC ').catch(error => {
        log.error(error)
    })
    var coinsData = {}
    var marketsData = {} 
    var marketsList = {}

    for (let market of markets) {
        marketsData[market.symbol] = await new ccxt[market.symbol]()
        marketsList[market.symbol] = market.symbol
    }

    
    first: for (let coin of coins) {
        coin = coin.symbol
        coinsData[coin] = []
        //let data = []
        second:for (let market in marketsList) {
            let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

            if (!marketsData[market].markets) {
                try {
                    console.log(market + ' load')
                    await marketsData[market].loadMarkets()
                    
                } catch (err) {
                    log.error(market + ' ' + err)
                    
                    delete marketsList[market]
                    continue
                }
            }

            var symbol = ['/USDT', '/USD', '/BTC', '/ETH']
            let dir = marketsData[market].markets


            for (let i of symbol) {
                if (dir[coin + i]) {
                    symbol = dir[coin + i].symbol

                    if (marketsData[market].has.fetchOHLCV) {
                        try {
                            await sleep(marketsData[market].rateLimit)
                            let time = new Date().getTime() - 604800000
                            marketsData[market].fetchOHLCV(symbol, '4h', time, 42).then(value => {
                                for (let item of value) {
                                    let time = item[0]
                                    let price = item[4]
                                    coinsData[coin].push([time,price])
                                }
                                console.log(coin)
                            }, err => {
                                delete marketsList[market]

                            })
                            continue first;
                        } catch (err) {
                            log.error(market + ' ' + err)
                            continue
                        }
                        
                        

                    } else {
                        delete marketsList[market]
                        break
                    }
                    break
                }
            }   
        }
        
    }
    let json = JSON.stringify(coinsData)
    fs.writeFile('./public/candle.json', json, 'utf8', function (err) {
        if (err) {
            log.error(err)
        } else {
            log.info('Json with candles was created')
        }
    });
}

function find(arr, quote, base, found = new Map(), notFound = []) {
    for (let i in arr) {
        let symbol = arr[i].symbol
        let main = arr[i].main
        let price = arr[i].price

        if (!price) {
            continue
        }

        if (quote === main) {
            if (base.has(symbol)) {
                price = price
                found.set(symbol, price)
                base.delete(symbol)
            }
        } else if (quote === symbol) {
            if (base.has(main)) {
                price = 1 / price
                found.set(main, price)
                base.delete(main)
            }
        } else if (!found.has(symbol) && found.has(main)) {
            if (base.has(symbol) && !found.has(symbol)) {
                price = price * found.get(main)
                found.set(symbol, price)
            }
        } else if (found.has(symbol) && !found.has(main)) {
            if (base.has(main) && !found.has(main)) {
                price = found.get(symbol) * (1 / price)
                found.set(main, price)
            }
        } else if (!found.has(symbol) && !found.has(main)) {
            if (base.has(symbol) && !found.has(symbol) || base.has(main) && !found.has(main)) {
                notFound.push({
                    symbol: symbol,
                    main: main,
                    price: price
                })
            }
        }
    }
    if (found.size > 0 & notFound.length > 0) {
        found = find(notFound, quote, base, found)
    }
    found.set(quote, 1)
    return found

}




module.exports = {
    exchanges,
    getData,
    getAllData,
    calc,
    rate,
    getImages,
    createSpark
}