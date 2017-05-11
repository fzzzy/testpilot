
import 'babel-polyfill/browser';
import es6Promise from 'es6-promise';
import 'isomorphic-fetch';
import 'l20n';
import Raven from 'raven-js';

import './lib/ga-snippet';
import config from './config';

import error from '../pages/error.js';
import experiment from '../pages/experiment.js';
import experiments from '../pages/experiments.js';
import home from '../pages/home.js';
import legacy from '../pages/legacy.js';
import onboarding from '../pages/onboarding.js';
import retire from '../pages/retire.js';
import share from '../pages/share.js';

es6Promise.polyfill();
Raven.config(config.ravenPublicDSN).install();

const routes = {
  error,
  experiment,
  experiments,
  home,
  legacy,
  onboarding,
  retire,
  share
};

const name = document.body.dataset.pageName;
const param = document.body.dataset.pageParam;
if (name in routes) {
  routes[name](param);
} else {
  routes.error();
}
