const { ToggleButton } = require('sdk/ui/button/toggle');
const { Panel } = require('sdk/panel');
const querystring = require('sdk/querystring');
const store = require('sdk/simple-storage').storage;
const tabs = require('sdk/tabs');
const self = require('sdk/self');
const { URL } = require('sdk/url');
const _ = require('sdk/l10n').get;

const Mustache = require('mustache');
const templates = require('./templates');
Mustache.parse(templates.installed);
Mustache.parse(templates.experimentList);

const Metrics = require('./metrics');
const xulcss = require('./xulcss');
xulcss.addXULStylesheet(self.data.url('button.css'));

const PANEL_WIDTH = 300;
const FOOTER_HEIGHT = 53;
const EXPERIMENT_HEIGHT = 80;
const MAX_HEIGHT = (EXPERIMENT_HEIGHT * 4) + 56 + FOOTER_HEIGHT;
const NEW_BADGE_LABEL = 'New';

const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;
const NEW_EXPERIMENT_PERIOD = 2 * ONE_WEEK;

let settings;
let button;
let panel;

function getExperimentList(availableExperiments, installedAddons) {
  const now = Date.now();

  const experiments = Object.keys(availableExperiments).map(k => {
    const experiment = availableExperiments[k];
    if (installedAddons[k]) {
      experiment.active = installedAddons[k].active;
    }
    const created = (new Date(experiment.created)).getTime();
    experiment.isNew = (now - created) < NEW_EXPERIMENT_PERIOD && !experiment.active;
    experiment.params = getParams();
    experiment.link = experiment.html_url;

    if (experiment.completed) {
      const completed = (new Date(experiment.completed)).getTime();
      const delta = completed - Date.now();
      if (delta < 0) {
        experiment.eolMessage = _('experiment_eol_complete_message');
        if (experiment.active &&
          !(experiment.addon_id in store.surveyChecks.eol)) {
          experiment.link = experiment.survey_url;
          experiment.params = querystring.stringify({
            id: experiment.addon_id,
            interval: 'eol',
            installed: Object.keys(store.installedAddons)});
        }
      } else if (delta < ONE_DAY) {
        experiment.eolMessage = _('experiment_eol_tomorrow_message');
      } else if (delta < ONE_WEEK) {
        experiment.eolMessage = _('experiment_eol_soon_message');
      }
      if (experiment.eolMessage) {
        experiment.showEol = true;
        experiment.hideActive = true;
      }
    }
    return experiment;
  })
  .filter(x => x.active || !x.completed); // remove inactive, completed experiments

  // Sort new experiments to the top, otherwise sort by reverse-chronological
  experiments.sort((a, b) => {
    if (a.isNew && !b.isNew) { return -1; }
    if (!a.isNew && b.isNew) { return 1; }
    return b.modified - a.modified;
  });

  return experiments;
}

function render(experiments) {
  return Mustache.render(templates.experimentList, {
    base_url: settings.BASE_URL,
    view_all_params: getParams('view-all-experiments'),
    experiments
  });
}

function showExperimentList() {
  panel.port.emit('show', render(panel.experiments));

  // HACK: Record toolbar button click here, so that badging state is
  // unchanged until after rendering the panel's instrumented links.
  store.toolbarButtonLastClicked = Date.now();
  ToolbarButton.updateButtonBadge(); // eslint-disable-line no-use-before-define
}

function getParams() {
  return querystring.stringify({
    utm_source: 'testpilot-addon',
    utm_medium: 'firefox-browser',
    utm_campaign: 'testpilot-doorhanger',
    utm_content: (!!button.badge) ? 'badged' : 'not badged'
  });
}

function handleButtonChange(state) {
  if (state.checked) {
    Metrics.pingTelemetry('txp_toolbar_menu_1', 'clicked', Date.now());
    panel.experiments = getExperimentList(
      store.availableExperiments || {},
      store.installedAddons || {});
    const height = Math.min(
      (panel.experiments.length * EXPERIMENT_HEIGHT) + FOOTER_HEIGHT,
      MAX_HEIGHT
    );
    panel.show({
      height,
      width: PANEL_WIDTH,
      position: button
    });
  }
}

function checkSurvey(url) {
  // HACK an id field is currently unique to survey_urls
  const addonId = querystring.parse(URL(url).search.substring(1)).id; // eslint-disable-line new-cap
  if (addonId) {
    store.surveyChecks.eol[addonId] = true;
  }
}

const ToolbarButton = module.exports = {

  init: function(settingsIn) {
    settings = settingsIn;

    button = ToggleButton({ // eslint-disable-line new-cap
      id: 'testpilot-link',
      label: 'Test Pilot',
      icon: './transparent-16.png',
      onChange: handleButtonChange
    });

    panel = Panel({ // eslint-disable-line new-cap
      contentURL: './base.html',
      contentScriptFile: './panel.js',
      onHide: () => {
        button.state('window', {checked: false});
      }
    });

    panel.on('show', showExperimentList);
    panel.port.on('back', showExperimentList);
    panel.port.on('link', url => {
      // TODO: Record metrics event here, along with badge context

      // if survey_url note survey as taken
      checkSurvey(url);

      tabs.open(url);
      panel.hide();
    });
  },

  destroy: function() {
    panel.destroy();
    button.destroy();
  },

  updateButtonBadge: function() {
    // Initialize the last button click timestamp if necessary.
    if (!('toolbarButtonLastClicked' in store)) {
      store.toolbarButtonLastClicked = Date.now();
    }

    // Look through available experiments for anything newer than the last
    // toolbar button click.
    let hasNew = false;
    if (store.availableExperiments) {
      Object.keys(store.availableExperiments).forEach(id => {
        const experiment = store.availableExperiments[id];
        const created = new Date(experiment.created);
        if (created.getTime() > store.toolbarButtonLastClicked) {
          hasNew = true;
        }
      });
    }

    // Show the button badge if there were new experiments found.
    if (hasNew) {
      // TODO: Needs l10n?
      button.badge = NEW_BADGE_LABEL;
    } else {
      button.badge = null;
    }
  },

  get button() {
    return button;
  }

};
