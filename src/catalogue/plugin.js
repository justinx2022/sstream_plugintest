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

    var DEFAULT_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*'
    };

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

    async function fetchText(url, headers) {
      try {
        var h = headers || DEFAULT_HEADERS;
        var res = await http_get(url, h);
        if (!res) return '';
        return typeof res === 'string' ? res : (res.body || '');
      } catch (e) {
        return '';
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
        var tmdbId = m.moviedb_id || undefined;
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
            url: JSON.stringify({ imdbId: id, tmdbId: tmdbId, type: 'movie', title: m.name, year: m.releaseInfo || m.year })
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
                  tmdbId: tmdbId,
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
              url: JSON.stringify({ imdbId: id, tmdbId: tmdbId, type: 'series', season: 1, episode: 1, title: m.name })
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

    function withTimeout(promise, ms, fallback) {
      var fb = fallback !== undefined ? fallback : null;
      return Promise.race([
        promise,
        new Promise(function(resolve) {
          setTimeout(function() { resolve(fb); }, ms);
        })
      ]);
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
        var tmdbId = parsed.tmdbId;

        // Resolve TMDB ID in parallel if missing
        var cinemetaPromise = (!tmdbId && imdbId) ? (async function() {
          try {
            var meta = await fetchJson(CINEMETA_V3 + '/meta/' + type + '/' + imdbId + '.json');
            if (meta && meta.meta && meta.meta.moviedb_id) {
              return meta.meta.moviedb_id;
            }
          } catch (e) {}
          return null;
        })() : Promise.resolve(tmdbId);

        var streams = [];
        var seenUrls = new Set();

        // 1. VidApi / VAPlayer Multi-CDN HLS Streams (High-Speed .m3u8)
        var vidapiPromise = (async function() {
          try {
            var resolvedTmdb = tmdbId || await cinemetaPromise;
            var idsToTry = [];
            if (resolvedTmdb) idsToTry.push('tmdb=' + resolvedTmdb);
            if (imdbId) idsToTry.push('imdb=' + imdbId);
            if (idsToTry.length === 0) return;

            var tvQuery = type === 'movie' ? '' : ('&season=' + season + '&episode=' + episode);
            var mirrors = [
              'https://streamdata.vaplayer.ru/api.php',
              'https://vaplayer.ru/api.php'
            ];

            for (var m = 0; m < mirrors.length; m++) {
              var mirrorBase = mirrors[m];
              for (var k = 0; k < idsToTry.length; k++) {
                var apiUrl = mirrorBase + '?' + idsToTry[k] + '&type=' + (type === 'movie' ? 'movie' : 'tv') + tvQuery;
                var json = await fetchJson(apiUrl, {
                  'User-Agent': DEFAULT_HEADERS['User-Agent'],
                  'Referer': 'https://brightpathsignals.com/',
                  'Origin': 'https://brightpathsignals.com'
                });

                if (json && (json.status_code == 200 || json.status_code === '200' || (json.data && json.data.stream_urls))) {
                  var list = json.data ? json.data.stream_urls : null;
                  var urlArray = Array.isArray(list) ? list : (typeof list === 'object' && list ? Object.values(list) : []);
                  if (urlArray.length > 0) {
                    for (var i = 0; i < urlArray.length; i++) {
                      var streamUrl = urlArray[i];
                      if (streamUrl && !seenUrls.has(streamUrl) && (streamUrl.includes('.m3u8') || streamUrl.includes('.mp4'))) {
                        seenUrls.add(streamUrl);
                        var isHLS = !streamUrl.includes('.mp4') && !streamUrl.includes('.mkv');
                        var q = parseQuality(streamUrl);
                        streams.push(new Nt({
                          url: streamUrl,
                          source: 'VidApi Server ' + (i + 1),
                          name: '⚡ VidApi Server ' + (i + 1) + ' [' + q + 'p ' + (isHLS ? 'HLS' : 'MP4') + ']',
                          quality: q,
                          type: isHLS ? 'hls' : 'mp4',
                          isM3U8: isHLS,
                          headers: {
                            'User-Agent': DEFAULT_HEADERS['User-Agent'],
                            'Referer': mirrorBase,
                            'Origin': 'https://brightpathsignals.com'
                          }
                        }));
                      }
                    }
                    return; // Successfully harvested VidApi mirror
                  }
                }
              }
            }
          } catch (e) {}
        })();

        // 2. VixSrc Multi-Audio Direct Master HLS Streams
        var vixsrcPromise = (async function() {
          try {
            var resolvedTmdb = tmdbId || await cinemetaPromise;
            var idsToTry = [];
            if (resolvedTmdb) idsToTry.push(resolvedTmdb);
            if (imdbId && imdbId !== resolvedTmdb) idsToTry.push(imdbId);
            if (idsToTry.length === 0) return;

            var domains = [
              'https://vixsrc.to',
              'https://vixcloud.co',
              'https://vixsrc.stream'
            ];

            for (var d = 0; d < domains.length; d++) {
              var domain = domains[d];
              for (var m = 0; m < idsToTry.length; m++) {
                var idToUse = idsToTry[m];
                var tvPath = type === 'movie' ? ('/api/movie/' + idToUse) : ('/api/tv/' + idToUse + '/' + season + '/' + episode);
                var json = await fetchJson(domain + tvPath, {
                  'User-Agent': DEFAULT_HEADERS['User-Agent'],
                  'Referer': domain,
                  'Origin': domain
                });

                if (json && json.src) {
                  var embedUrl = json.src.startsWith('http') ? json.src : (domain + json.src);
                  var embedHtml = await fetchText(embedUrl, {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': domain
                  });

                  var tokenMatch = embedHtml.match(/token["']\s*:\s*["']([^"']+)/) || embedHtml.match(/token\s*=\s*["']([^"']+)/);
                  var expiresMatch = embedHtml.match(/expires["']\s*:\s*["']([^"']+)/) || embedHtml.match(/expires\s*=\s*["']([^"']+)/);
                  var playlistMatch = embedHtml.match(/url\s*:\s*["']([^"']+)/) || embedHtml.match(/source\s*:\s*["']([^"']+)/);

                  if (playlistMatch && tokenMatch && expiresMatch) {
                    var playlistUrl = playlistMatch[1];
                    var sep = playlistUrl.includes('?') ? '&' : '?';
                    var masterUrl = playlistUrl + sep + 'token=' + tokenMatch[1] + '&expires=' + expiresMatch[1] + '&h=1';
                    if (!seenUrls.has(masterUrl)) {
                      seenUrls.add(masterUrl);
                      var hostLabel = domain.replace('https://', '');
                      streams.push(new Nt({
                        url: masterUrl,
                        source: 'VixSrc Multi-Audio (' + hostLabel + ')',
                        name: '⚡ VixSrc Multi-Audio [1080p Master HLS]',
                        quality: 1080,
                        type: 'hls',
                        isM3U8: true,
                        headers: {
                          'User-Agent': DEFAULT_HEADERS['User-Agent'],
                          'Referer': embedUrl,
                          'Origin': domain
                        }
                      }));
                      return; // Found master playlist
                    }
                  }
                }
              }
            }
          } catch (e) {}
        })();

        // Execute all extractors in parallel with timeout protection
        await Promise.all([
          withTimeout(vidapiPromise, 8000),
          withTimeout(vixsrcPromise, 8000)
        ]);

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
