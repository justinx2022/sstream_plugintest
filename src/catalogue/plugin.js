var PluginModule = (() => {
  (function() {
    'use strict';

    var mt = typeof MultimediaItem !== 'undefined' ? MultimediaItem : class { constructor(t) { Object.assign(this, t); } };
    var gt = typeof Episode !== 'undefined' ? Episode : class { constructor(t) { Object.assign(this, t); } };
    var Nt = typeof StreamResult !== 'undefined' ? StreamResult : class {
      constructor(t) {
        this.url = t.url;
        this.source = t.source || t.name;
        this.name = t.name || t.source;
        this.headers = t.headers || {};
        if (t.quality) this.quality = t.quality;
        if (t.size) this.size = t.size;
        if (t.type) this.type = t.type;
        if (t.isM3U8) this.isM3U8 = t.isM3U8;
      }
    };
    var Ht = typeof Actor !== 'undefined' ? Actor : class { constructor(t) { Object.assign(this, t); } };

    var CINEMETA_CATALOG = 'https://cinemeta-catalogs.strem.io/top/catalog';
    var CINEMETA_V3 = 'https://v3-cinemeta.strem.io';
    var TORRENTIO_BASE = 'https://torrentio.strem.fun';
    var YTS_API = 'https://movies-api.accel.li/api/v2';

    var DEFAULT_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };

    var TRACKERS = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://explodie.org:6969/announce',
      'udp://tracker.coppersurfer.tk:6969/announce',
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.tiny-vps.com:6969/announce'
    ];

    function buildMagnet(infoHash, dn) {
      var magnet = 'magnet:?xt=urn:btih:' + infoHash + '&dn=' + encodeURIComponent(dn || infoHash);
      for (var i = 0; i < TRACKERS.length; i++) {
        magnet += '&tr=' + encodeURIComponent(TRACKERS[i]);
      }
      return magnet;
    }

    function parseQuality(str) {
      var s = String(str || '').toLowerCase();
      if (s.includes('4k') || s.includes('2160p') || s.includes('uhd')) return 2160;
      if (s.includes('1080p') || s.includes('fhd') || s.includes('bluray') || s.includes('blu-ray')) return 1080;
      if (s.includes('720p') || s.includes('hd')) return 720;
      if (s.includes('480p')) return 480;
      return 1080;
    }

    async function fetchJson(url, headers) {
      try {
        var h = headers || DEFAULT_HEADERS;
        var res = await http_get(url, h);
        if (!res) return null;
        var body = typeof res === 'string' ? res : (res.body || '');
        if (!body) return null;
        return JSON.parse(body);
      } catch (e) {
        return null;
      }
    }

    async function getHome(cb) {
      try {
        var feeds = [
          { title: 'Popular Movies', url: CINEMETA_CATALOG + '/movie/top.json', type: 'movie' },
          { title: 'Popular Series', url: CINEMETA_CATALOG + '/series/top.json', type: 'series' },
          { title: 'Top Rated Movies', url: CINEMETA_CATALOG + '/movie/imdbRating.json', type: 'movie' },
          { title: 'Top Rated Series', url: CINEMETA_CATALOG + '/series/imdbRating.json', type: 'series' },
          { title: 'Action & Adventure', url: CINEMETA_CATALOG + '/movie/top/genre=Action.json', type: 'movie' },
          { title: 'Sci-Fi & Fantasy', url: CINEMETA_CATALOG + '/series/top/genre=Sci-Fi.json', type: 'series' }
        ];

        var data = {};
        for (var i = 0; i < feeds.length; i++) {
          var feed = feeds[i];
          var json = await fetchJson(feed.url);
          if (json && Array.isArray(json.metas)) {
            var items = [];
            var metas = json.metas.slice(0, 24);
            for (var j = 0; j < metas.length; j++) {
              var m = metas[j];
              items.push(new mt({
                title: m.name,
                url: JSON.stringify({ id: m.imdb_id || m.id, type: feed.type, title: m.name, year: m.releaseInfo }),
                posterUrl: m.poster || '',
                bannerUrl: m.background || '',
                description: m.description || '',
                year: parseInt(m.releaseInfo, 10) || undefined,
                score: parseFloat(m.imdbRating) || undefined,
                type: feed.type
              }));
            }
            if (items.length > 0) {
              data[feed.title] = items;
            }
          }
        }
        cb({ success: true, data: data });
      } catch (err) {
        cb({ success: false, errorCode: 'SITE_OFFLINE', message: err.message || String(err) });
      }
    }

    async function search(query, cb) {
      try {
        var q = encodeURIComponent(String(query || '').trim());
        var movPromise = fetchJson(CINEMETA_V3 + '/catalog/movie/top/search=' + q + '.json');
        var serPromise = fetchJson(CINEMETA_V3 + '/catalog/series/top/search=' + q + '.json');

        var results = [];
        var resList = await Promise.all([movPromise, serPromise]);

        var types = ['movie', 'series'];
        for (var i = 0; i < resList.length; i++) {
          var json = resList[i];
          var t = types[i];
          if (json && Array.isArray(json.metas)) {
            for (var j = 0; j < json.metas.length; j++) {
              var m = json.metas[j];
              results.push(new mt({
                title: m.name,
                url: JSON.stringify({ id: m.imdb_id || m.id, type: t, title: m.name, year: m.releaseInfo }),
                posterUrl: m.poster || '',
                bannerUrl: m.background || '',
                description: m.description || '',
                year: parseInt(m.releaseInfo, 10) || undefined,
                score: parseFloat(m.imdbRating) || undefined,
                type: t
              }));
            }
          }
        }
        cb({ success: true, data: results });
      } catch (err) {
        cb({ success: true, data: [] });
      }
    }

    async function load(rawUrl, cb) {
      try {
        var parsed = null;
        try {
          parsed = JSON.parse(rawUrl);
        } catch (e) {
          var parts = String(rawUrl).split('|');
          parsed = { id: parts[0], type: parts[1] || 'movie' };
        }

        var id = parsed.id || parsed.imdbId;
        var type = parsed.type || 'movie';

        var metaUrl = CINEMETA_V3 + '/meta/' + type + '/' + id + '.json';
        var json = await fetchJson(metaUrl);

        if (!json || !json.meta) {
          return cb({ success: false, errorCode: 'NOT_FOUND', message: 'Title not found' });
        }

        var m = json.meta;
        var cast = [];
        if (Array.isArray(m.cast)) {
          for (var i = 0; i < Math.min(m.cast.length, 15); i++) {
            cast.push(new Ht({ name: m.cast[i] }));
          }
        }

        var episodes = [];
        if (type === 'movie') {
          episodes.push(new gt({
            name: 'Full Movie',
            season: 1,
            episode: 1,
            posterUrl: m.poster || '',
            description: m.description || '',
            url: JSON.stringify({ imdbId: id, type: 'movie', title: m.name, year: m.releaseInfo || m.year })
          }));
        } else {
          if (Array.isArray(m.videos) && m.videos.length > 0) {
            for (var k = 0; k < m.videos.length; k++) {
              var v = m.videos[k];
              episodes.push(new gt({
                name: v.title || v.name || ('Episode ' + (v.episode || v.number || (k + 1))),
                season: v.season || 1,
                episode: v.episode || v.number || (k + 1),
                posterUrl: v.thumbnail || m.poster || '',
                description: v.overview || v.description || '',
                airDate: v.released || '',
                url: JSON.stringify({
                  imdbId: id,
                  type: 'series',
                  season: v.season || 1,
                  episode: v.episode || v.number || (k + 1),
                  title: m.name,
                  epTitle: v.title || v.name
                })
              }));
            }
          } else {
            episodes.push(new gt({
              name: 'Episode 1',
              season: 1,
              episode: 1,
              posterUrl: m.poster || '',
              url: JSON.stringify({ imdbId: id, type: 'series', season: 1, episode: 1, title: m.name })
            }));
          }
        }

        var item = new mt({
          title: m.name,
          url: rawUrl,
          posterUrl: m.poster || '',
          bannerUrl: m.background || '',
          logoUrl: m.logo || '',
          description: m.description || '',
          year: parseInt(m.releaseInfo || m.year, 10) || undefined,
          score: parseFloat(m.imdbRating) || undefined,
          cast: cast,
          type: type,
          episodes: episodes
        });

        cb({ success: true, data: item });
      } catch (err) {
        cb({ success: false, errorCode: 'PARSE_ERROR', message: err.message || String(err) });
      }
    }

    async function loadStreams(rawUrl, cb) {
      try {
        var parsed = null;
        try {
          parsed = JSON.parse(rawUrl);
        } catch (e) {
          var parts = String(rawUrl).split('|');
          parsed = {
            imdbId: parts[0],
            type: parts[1] || 'movie',
            season: parseInt(parts[2], 10) || 1,
            episode: parseInt(parts[3], 10) || 1
          };
        }

        var imdbId = parsed.imdbId || parsed.id;
        var type = parsed.type || 'movie';
        var season = parsed.season || 1;
        var episode = parsed.episode || 1;
        var title = parsed.title || imdbId;

        var streams = [];
        var seenUrls = new Set();

        // 1. Torrentio Multi-Scraper
        var torrentioUrl = type === 'movie'
          ? TORRENTIO_BASE + '/stream/movie/' + imdbId + '.json'
          : TORRENTIO_BASE + '/stream/series/' + imdbId + ':' + season + ':' + episode + '.json';

        var torrentioPromise = fetchJson(torrentioUrl).then(function(json) {
          if (json && Array.isArray(json.streams)) {
            for (var i = 0; i < json.streams.length; i++) {
              var s = json.streams[i];
              if (s.infoHash) {
                var firstLine = (s.title || '').split('\n')[0] || title;
                var magnet = buildMagnet(s.infoHash, firstLine);
                if (!seenUrls.has(magnet)) {
                  seenUrls.add(magnet);
                  var q = parseQuality(s.name + ' ' + s.title);
                  var tag = (s.name || '').replace(/\n/g, ' ').trim();
                  streams.push(new Nt({
                    url: magnet,
                    source: 'Torrentio [' + tag + ']',
                    name: 'Torrentio [' + tag + ']',
                    quality: q,
                    headers: {}
                  }));
                }
              }
            }
          }
        });

        // 2. YTS Accelli Scraper (Movies)
        var ytsPromise = Promise.resolve();
        if (type === 'movie') {
          ytsPromise = fetchJson(YTS_API + '/list_movies.json?query_term=' + encodeURIComponent(imdbId)).then(function(json) {
            if (json && json.data && Array.isArray(json.data.movies)) {
              var movie = json.data.movies[0];
              if (movie && Array.isArray(movie.torrents)) {
                for (var j = 0; j < movie.torrents.length; j++) {
                  var tor = movie.torrents[j];
                  if (tor.hash) {
                    var qStr = tor.quality || '1080p';
                    var dn = (movie.title || title) + ' (' + (movie.year || '') + ') [' + qStr + '] [YTS]';
                    var magnet = buildMagnet(tor.hash, dn);
                    if (!seenUrls.has(magnet)) {
                      seenUrls.add(magnet);
                      var qVal = parseQuality(qStr);
                      var sizeStr = tor.size ? ' (' + tor.size + ')' : '';
                      streams.push(new Nt({
                        url: magnet,
                        source: 'YTS [' + qStr.toUpperCase() + ']' + sizeStr,
                        name: 'YTS [' + qStr.toUpperCase() + ']',
                        quality: qVal,
                        headers: {}
                      }));
                    }
                  }
                }
              }
            }
          });
        }

        await Promise.all([torrentioPromise, ytsPromise]);

        // Quality descending sort
        streams.sort(function(a, b) {
          return (b.quality || 0) - (a.quality || 0);
        });

        cb({ success: true, data: streams });
      } catch (err) {
        cb({ success: true, data: [] });
      }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
  })();
})();

Object.assign(globalThis, PluginModule);
