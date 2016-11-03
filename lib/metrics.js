'use strict';

const Plugins = require('./plugins/'),
    _ = require('lodash'),
    Graphite = require('../lib/graphite/client'),
    util = require('util'),
    metrics = require('metrics'),
    debug = require('debug')('metrics');

let Metrics,
    apiKey = process.env.HOSTEDGRAPHITE_APIKEY;



Metrics = function (opts) {
    opts = opts || {};

    this.opts = {};

    this.httpRequest = new Plugins.HttpRequest();
    this.httpResponse = new Plugins.HttpResponse();

    this.system = new Plugins.System();
    this.fetch = new Plugins.Fetch();
    this.aggregators = [];

    // arbitrary counters
    this.customCounters = {};
    this.customHistograms = {};
};

Metrics.prototype.init = function (opts) {
    debug(`Options passed to Metrics ${JSON.stringify(opts)}`);

    // Derive the keys based on the platform, Eg, <platform>.<application>.<instance>.<metric>
    const platform = (process.env.KUBERNETES_PORT) ? 'kubernetes' : 'local',
        isProduction = (process.env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production') || (process.env.ENVIRONMENT === 'prod' || process.env.NODE_ENV === 'prod') ;

    apiKey = (apiKey) ? apiKey.trim() : null;
    let self = this,
        hostname,
        environment,
        product,
        prefix,
        isLogging = (process.env.DEBUGMETRICS === '1');
    this.opts = opts;

    isLogging = isLogging || isProduction;
    environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'unknown-environemnt';
    if (!apiKey && (isLogging)) {
        throw 'No HOSTEDGRAPHITE_APIKEY is set. Please set a false one if you are on your localhost.';
    }

    if (platform === 'kubernetes') {
        hostname = process.env.HOSTNAME.toLowerCase() || 'unknown-kub';
    } else {
        hostname = 'localhost';
    }

    //If product is passed in. Lets use that
    if (opts.product) {
        product = opts.product;
    } else {
        product = process.env.PRODUCT || 'unknown-product';
    }

    if (this.graphite) {
        console.warn('Metrics already configured, not re-initialising');
        return;
    }

    prefix = util.format('.%s.%s.%s.%s.%s.', platform, hostname,  product, environment, this.opts.app);

    if (!this.opts.app) {
        throw 'You need to specify an application name in the configuration options.';
    }

    debug(`We are Logging- ${isLogging}`);

    this.graphite = new Graphite({
        apiKey: apiKey,
        prefix: prefix,
        isLogging: isLogging
    });

    if (parseInt(this.opts.flushEvery) === 'NaN') {
        throw new Error('flushEvery must be an integer');
    }

    this.setupDefaultAggregators();

    setInterval(function () {
        self.flush();
    }, this.opts.flushEvery);
};

// Allow arbitrary counters
Metrics.prototype.count = function (metric, value) {
    if (!this.customCounters.hasOwnProperty(metric)) {
        this.customCounters[metric] = new metrics.Counter();
    }

    debug(`Count - ${metric}`);

    this.customCounters[metric].inc(value || 1);
};

// Allow arbitrary Histograms
Metrics.prototype.histogram = function (metric, value) {
    if (!this.customHistograms.hasOwnProperty(metric)) {
        this.customHistograms[metric] = new metrics.Histogram.createUniformHistogram();
    }

    this.customHistograms[metric].update(value);
};

Metrics.prototype.flushCustomCounters = function () {
    return _.mapValues(this.customCounters, function (counter) {
        let val = counter.count;
        counter.clear();
        return val;
    });
};

Metrics.prototype.flushCustomHistograms = function () {
    let obj = {};

    _.each(this.customHistograms, function (value, key) {
        obj[`${key}.min`] = value.min;
        obj[`${key}.max`] = value.max;
        obj[`${key}.mean`] = value.mean();
        obj[`${key}.count`] = value.count;
    });

    return obj;
};

Metrics.prototype.flushRate = function () {
    let obj = {};

    obj['flush.rate'] = this.opts.flushEvery / 1000;

    return obj;
};

Metrics.prototype.setupDefaultAggregators = function () {
    debug(this.opts);

    if (this.opts.hasOwnProperty('plugins')) {
        if (this.opts.plugins.indexOf('customCounters') >= 0) {
            this.registerAggregator(this.flushCustomCounters.bind(this));
            this.registerAggregator(this.flushCustomHistograms.bind(this));
        }
    } else {
        this.registerAggregator(this.flushCustomCounters.bind(this));
        this.registerAggregator(this.flushCustomHistograms.bind(this));
        this.registerAggregator(this.system.counts);
        this.registerAggregator(this.flushRate.bind(this));
        this.registerAggregator(this.httpRequest.reporter);
        this.registerAggregator(this.httpResponse.reporter);
    }
};

Metrics.prototype.flush = function () {
    // transport metrics to graphite
    this.graphite.log(_.merge.apply(this, this.aggregators.map(function (aggregator) {
        return aggregator();
    })));
};

Metrics.prototype.instrument = function (obj, opts) {
    opts = opts || {};

    switch (opts.as) {
        case 'http.response':
            this.httpResponse.instrument(obj);
            break;

        case 'http.request':
            this.httpRequest.instrument(obj);
            break;

        default:
            throw new Error('No valid "opts.as" argument given. You need to specify the object you want instrumented.');
    }
};

Metrics.prototype.registerAggregator = function (func) {
    this.aggregators.push(func);
};

module.exports = new Metrics();
module.exports.knownservices = require('./services/knownservices');
