'use strict';
const app = require('../../services/nodevoto-web/app');

const _superagent = require('superagent');
const logger = require('../../lib/logger');
const util = require('util');
const expect = require('chai').expect;

const superget = util.promisify(_superagent.get);

const WEB_PORT = '8088';

const testMap = [
  {
    unicode: '👻',
    shortcode: ':ghost:'
  },{
    unicode: '🤔',
    shortcode: ':thinking:'
  },{
    unicode: '🐷',
    shortcode: ':pig:'
  },{
    unicode: '💩',
    shortcode: ':poop:'
  }
];

class EmojiMock {
  FindByShortcode (args, callback) {
    let match = testMap.filter(v => {
      return v.shortcode === args.Shortcode;
    });

    let ret = match.length > 0 ? match[0] : null;

    return callback(null, { Emoji: ret });
  }

  ListAll (args, callback) {
    return callback(null, { list: testMap });
  }
}

class VotingMock {
  constructor() {
    this.counters = new Map();
    this.results = [];
  }

  get (key) {
    return this.counters.get(key);
  }

  inc (key) {
    if (this.counters.get(key) === undefined) {
      this.counters.set(key, 0);
    }

    let nval = this.counters.get(key) + 1;
    this.counters.set(key, nval);
  }

  setResults(res) {
    this.results = res;
  }

  Results (args, callback) {
    return callback(null, { results: this.results });
  }

  VoteGhost (args, callback) {
    this.inc(':ghost:');
    return callback(null);
  }

  VotePoop (args, callback) {
    return callback('Unkown error', null);
  }
}

describe('app', () => {
  let web;
  let server;
  let emoji;
  let voting;

  beforeEach(async() => {
    emoji = new EmojiMock();
    voting = new VotingMock();

    web = await app.create(WEB_PORT,
      null,
      'services/nodevoto-web/webapp/dist/index_bundle.js',
      emoji,
      voting);

    server = web.listen(WEB_PORT, () => {
      logger.info(`Starting web server on WEB_PORT=[${WEB_PORT}]`);
    });
  });

  afterEach(async() => {
    server.close();
  });

  describe('#handleVoteEmoji', () => {
    it('should return 200 for valid :ghost: emoji', async() => {
      let response = await superget(`http://127.0.0.1:${WEB_PORT}/api/vote?choice=:ghost:`);

      expect(response.status).equals(200);
      expect(voting.get(':ghost:')).equals(1);
    });

    it('should reject vote for :poop: emoji', async() => {
      try {
        let response = await superget(`http://127.0.0.1:${WEB_PORT}/api/vote?choice=:poop:`);
        expect(response).to.equal(null);
      } catch(err) {
        expect(err.status).equals(500);
        expect(err.message).equals('Internal Server Error');
      }
    });

    it('should reject vote without choice parameter', async() => {
      try {
        let response = await superget(`http://127.0.0.1:${WEB_PORT}/api/vote`);
        expect(response).to.equal(null);
      } catch(err) {
        expect(err.status).equals(400);
        expect(err.message).equals('Bad Request');
      }
    });

    it('should reject vote if shortcode does not exist', async() => {
      try {
        let response = await superget(`http://127.0.0.1:${WEB_PORT}/api/vote?choice=:unknown:`);
        expect(response).to.equal(null);
      } catch (err) {
        expect(err.status).equals(400);
        expect(err.message).equals('Bad Request');
      }
    });
  });

  describe('#handleLeaderboard', () => {
    it('should register votes in leaderboard', async() => {
      let results = [
        { Shortcode: ':ghost:', Votes: 5 },
        { Shortcode: ':thinking:', Votes: 3 },
        { Shortcode: ':pig:', Votes: 2 },
      ];
      voting.setResults(results);

      let response = await superget(`http://127.0.0.1:${WEB_PORT}/api/leaderboard`);

      expect(response.body[0].votes).equals(5);
      expect(response.body[0].shortcode).equals(':ghost:');

      expect(response.body[1].votes).equals(3);
      expect(response.body[1].shortcode).equals(':thinking:');

      expect(response.body[2].votes).equals(2);
      expect(response.body[2].shortcode).equals(':pig:');
    });
  });

  describe('#handleListEmoji', () => {
    it('should return the correct list', async() => {
      let response = await superget(`http://127.0.0.1:${WEB_PORT}/api/list`);

      testMap.forEach((v, i) => {
        expect(testMap[i].shortcode).equals(response.body[i].shortcode);
        expect(testMap[i].unicode).equals(response.body[i].unicode);
      });
    });
  });

});