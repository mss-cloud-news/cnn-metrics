'use strict';

const Metrics = require('../lib/metrics');

Metrics.init({
    app: 'api',
    product: 'cnnmetric-example',
    flushEvery: 1000 * 2,
    plugins: [
        'customCounters'
    ]
});

console.log('Start');

setInterval(() => {
    console.log('count');
    Metrics.count('hit.counter');
}, 1000 * .5);
