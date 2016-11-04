'use strict';

const _ = require('lodash'),
    dogapi = require('dogapi'),
    debug = require('debug')('cnn-metrics:datadog'),
    Datadog = function (opts) {
        this.apiKey = opts.apiKey;
        this.options = opts.options;
        this.loggingMessageDisplayed = false;
        this.flushCounter = 0;
        this.isLogging = opts.isLogging;
        this.prefix = `${this.options.product}.${this.options.environment}.${this.options.app}`;
        let datadogOptions = opts.datadogOptions;
        dogapi.initialize(datadogOptions);
    };

// Send Metrics to DataDog
Datadog.prototype.formatMetric = function (metricValue, metricName) {
    let self = this,
        returnMetric = [{
            metric: `${self.prefix}.${metricName}`,
            points: metricValue,
            tags: [`platform:${self.options.platform}`, `hostname:${self.options.hostname}`]
        }];
    debug(returnMetric);
    return returnMetric;
}
Datadog.prototype.log = function (metrics) {
    let noNulls = metrics,
        self = this,
        data;
    data = _.map(noNulls, function (value, name) {
        debug(`Sending Metric for ${name}`)
        let metric = self.formatMetric(value, name);
        console.log(metric)
        dogapi.metric.send_all(metric);
    });

}
module.exports = Datadog;
