var PluginModule = (() => {
  const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://yoturkish.to/"
  };

  function decodeBase64(str) {
    if (typeof atob === "function") {
      try { return atob(str); } catch (e) {}
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let output = "";
    str = String(str).replace(/=+$/, "");
    for (let bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  }

  function decodeDataS(raw) {
    let b64 = Array.isArray(raw) ? raw.join("") : String(raw || "").replace(/\|/g, "");
    let bin = decodeBase64(b64);
    let rev = "";
    for (let i = bin.length - 1; i >= 0; i--) {
      rev += bin.charAt(i);
    }
    let shifted = "";
    let shift = 5;
    for (let i = 0; i < rev.length; i++) {
      shifted += String.fromCharCode(((rev.charCodeAt(i) - shift) % 256 + 256) % 256);
    }
    let key = [86, 110, 51, 72, 106, 87, 56, 102];
    let res = "";
    for (let i = 0; i < shifted.length; i++) {
      res += String.fromCharCode(shifted.charCodeAt(i) ^ key[i % key.length]);
    }
    return res;
  }

  function unpackDeanEdwards(code) {
    let match = code.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
    if (!match) return null;
    try {
      let withoutEval = match[0].replace(/^eval/, "");
      return (new Function("return " + withoutEval))();
    } catch (e) {
      return null;
    }
  }

  async function getHome(callback) {
    try {
      let res = await http_get("https://yoturkish.to/home/", defaultHeaders);
      if (!res || !res.body) {
        return callback({ success: false, errorCode: "SITE_OFFLINE", message: "No response from site" });
      }

      let html = res.body;

      // 1. New Episodes section
      let newEpisodes = [];
      let newEpSectionStart = html.indexOf("<h2>New Episodes</h2>");
      let seriesSectionStart = html.indexOf("<h2>Series List</h2>");

      if (newEpSectionStart !== -1 && seriesSectionStart !== -1) {
        let newEpHtml = html.slice(newEpSectionStart, seriesSectionStart);
        let epRegex = /<a\s+[^>]*href="([^"]+)"\s+title="([^"]+)"\s+class="poster">[\s\S]*?<img[^>]+src="([^"]+)"/gi;
        let em;
        let seenEps = new Set();
        while ((em = epRegex.exec(newEpHtml)) !== null) {
          let u = em[1].trim();
          if (seenEps.has(u)) continue;
          seenEps.add(u);
          newEpisodes.push(new MultimediaItem({
            title: em[2].replace(/&#8211;/g, "-").trim(),
            url: u,
            posterUrl: em[3].trim(),
            type: "series"
          }));
        }
      }

      // 2. Turkish Series section
      let seriesList = [];
      let seriesHtml = seriesSectionStart !== -1 ? html.slice(seriesSectionStart) : html;
      let sRegex = /<a\s+[^>]*href="([^"]+)"\s+title="([^"]+)"\s+class="poster">[\s\S]*?<img[^>]+src="([^"]+)"/gi;
      let sm;
      let seenSeries = new Set();
      while ((sm = sRegex.exec(seriesHtml)) !== null) {
        let u = sm[1].trim();
        if (seenSeries.has(u)) continue;
        seenSeries.add(u);
        seriesList.push(new MultimediaItem({
          title: sm[2].replace(/&#8211;/g, "-").trim(),
          url: u,
          posterUrl: sm[3].trim(),
          type: "series"
        }));
      }

      callback({
        success: true,
        data: {
          "New Episodes": newEpisodes,
          "Turkish Series": seriesList
        }
      });
    } catch (e) {
      callback({ success: false, errorCode: "FETCH_ERROR", message: e.message || String(e) });
    }
  }

  async function search(query, callback) {
    try {
      let searchUrl = "https://yoturkish.to/?s=" + encodeURIComponent(query);
      let res = await http_get(searchUrl, defaultHeaders);
      if (!res || !res.body) {
        return callback({ success: true, data: [] });
      }

      let postRegex = /<a\s+[^>]*href="([^"]+)"\s+title="([^"]+)"\s+class="poster">[\s\S]*?<img[^>]+src="([^"]+)"/gi;
      let items = [];
      let m;
      let seen = new Set();
      while ((m = postRegex.exec(res.body)) !== null) {
        let u = m[1].trim();
        if (seen.has(u)) continue;
        seen.add(u);
        items.push(new MultimediaItem({
          title: m[2].replace(/&#8211;/g, "-").trim(),
          url: u,
          posterUrl: m[3].trim(),
          type: "series"
        }));
      }

      callback({ success: true, data: items });
    } catch (e) {
      callback({ success: true, data: [] });
    }
  }

  async function load(url, callback) {
    try {
      let res = await http_get(url, defaultHeaders);
      if (!res || !res.body) {
        return callback({ success: false, errorCode: "PARSE_ERROR", message: "Failed to load page" });
      }

      let html = res.body;
      let titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      let rawTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").replace(/&#8211;/g, "-").trim() : "Unknown";
      let title = rawTitle.replace(/\s+/g, " ");

      let imgMatch = html.match(/class="poster"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
      let posterUrl = imgMatch ? imgMatch[1].trim() : "";

      let descMatch = html.match(/<div class="entry-content">([\s\S]*?)<\/div>/i);
      let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      let epRegex = /<a\s+class="episod"\s+href="([^"]+)">([\s\S]*?)<\/a>/gi;
      let episodes = [];
      let em;
      let epIndex = 1;
      let seen = new Set();

      while ((em = epRegex.exec(html)) !== null) {
        let epUrl = em[1].trim();
        if (seen.has(epUrl)) continue;
        seen.add(epUrl);

        let epRawText = em[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        let seasonMatch = em[2].match(/Season\s*(\d+)/i);
        let season = seasonMatch ? parseInt(seasonMatch[1], 10) : 1;

        let epNumMatch = epRawText.match(/Episode\s*(\d+)/i);
        let episodeNum = epNumMatch ? parseInt(epNumMatch[1], 10) : epIndex;

        episodes.push(new Episode({
          name: epRawText || ("Episode " + episodeNum),
          season: season,
          episode: episodeNum,
          posterUrl: posterUrl,
          url: epUrl
        }));
        epIndex++;
      }

      // Standalone single episode fallback if no list found
      if (episodes.length === 0) {
        episodes.push(new Episode({
          name: title,
          season: 1,
          episode: 1,
          posterUrl: posterUrl,
          url: url
        }));
      }

      let item = new MultimediaItem({
        title: title,
        url: url,
        posterUrl: posterUrl,
        type: "series",
        description: description,
        episodes: episodes
      });

      callback({ success: true, data: item });
    } catch (e) {
      callback({ success: false, errorCode: "PARSE_ERROR", message: e.message || String(e) });
    }
  }

  async function loadStreams(episodeUrl, callback) {
    try {
      let res = await http_get(episodeUrl, defaultHeaders);
      let streams = [];

      if (res && res.body) {
        let html = res.body;

        // 1. Extract and decrypt server tokens (data-s1, data-s2, etc.)
        let tokenRegex = /data-s\d+="([^"]+)"/g;
        let tm;
        let serverUrls = [];

        while ((tm = tokenRegex.exec(html)) !== null) {
          try {
            let decHtml = decodeDataS(tm[1]);
            let srcMatch = decHtml.match(/src="([^"]+)"/i);
            if (srcMatch && srcMatch[1]) {
              serverUrls.push(srcMatch[1].trim());
            }
          } catch (e) {}
        }

        // 2. Process each server URL
        for (let sUrl of serverUrls) {
          if (!sUrl.startsWith("http")) continue;

          // Engifuosi: Extract direct HLS master.m3u8 (Very fast & reliable 1080p)
          if (sUrl.includes("engifuosi")) {
            try {
              let eRes = await http_get(sUrl, {
                "User-Agent": defaultHeaders["User-Agent"],
                "Referer": "https://yoturkish.to/"
              });
              if (eRes && eRes.body) {
                let unpacked = unpackDeanEdwards(eRes.body);
                if (unpacked) {
                  let m3u8Match = unpacked.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
                  if (m3u8Match) {
                    streams.push(new StreamResult({
                      source: "Engifuosi [Direct FHD]",
                      name: "Engi (1080p Direct)",
                      url: m3u8Match[0],
                      quality: 1080,
                      headers: { "Referer": "https://engifuosi.com/" }
                    }));
                  }
                }
              }
            } catch (err) {}

            streams.push(new StreamResult({
              source: "Engifuosi [Embed]",
              name: "Engi Embed",
              url: sUrl,
              quality: 1080,
              headers: { "Referer": episodeUrl }
            }));
          } else if (sUrl.includes("vidmoly")) {
            // VidMoly: extract direct master.m3u8
            try {
              let vRes = await http_get(sUrl, {
                "User-Agent": defaultHeaders["User-Agent"],
                "Referer": episodeUrl
              });
              if (vRes && vRes.body) {
                let m3u8Match = vRes.body.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
                if (m3u8Match) {
                  streams.push(new StreamResult({
                    source: "VidMoly [Direct FHD]",
                    name: "VidMoly (1080p Direct)",
                    url: m3u8Match[0],
                    quality: 1080,
                    headers: { "Referer": "https://vidmoly.biz/" }
                  }));
                }
              }
            } catch (err) {}

            streams.push(new StreamResult({
              source: "VidMoly [Embed]",
              name: "VidMoly Embed",
              url: sUrl,
              quality: 1080,
              headers: { "Referer": episodeUrl }
            }));
          } else if (sUrl.includes("voe")) {
            streams.push(new StreamResult({
              source: "VOE [Player]",
              name: "VOE",
              url: sUrl,
              quality: 1080,
              headers: { "Referer": episodeUrl }
            }));
          } else if (sUrl.includes("rufiiguta")) {
            streams.push(new StreamResult({
              source: "Rufii [Player]",
              name: "Rufii",
              url: sUrl,
              quality: 1080,
              headers: { "Referer": episodeUrl }
            }));
          } else {
            streams.push(new StreamResult({
              source: "Server [Embed]",
              name: "Server",
              url: sUrl,
              quality: 1080,
              headers: { "Referer": episodeUrl }
            }));
          }
        }

        // 3. Check for any direct media links in the episode page
        let mediaRegex = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/gi;
        let mm;
        while ((mm = mediaRegex.exec(html)) !== null) {
          let mUrl = mm[0].trim();
          streams.push(new StreamResult({
            source: "YoTurkish Direct",
            name: "Direct",
            url: mUrl,
            quality: 1080,
            headers: { "Referer": episodeUrl }
          }));
        }
      }

      // Fallback
      if (streams.length === 0) {
        streams.push(new StreamResult({
          source: "YoTurkish Web",
          name: "Web Player",
          url: episodeUrl,
          quality: 1080,
          headers: { "Referer": "https://yoturkish.to/" }
        }));
      }

      callback({ success: true, data: streams });
    } catch (e) {
      callback({
        success: true,
        data: [
          new StreamResult({
            source: "YoTurkish Web",
            name: "Web Player",
            url: episodeUrl,
            quality: 1080,
            headers: { "Referer": "https://yoturkish.to/" }
          })
        ]
      });
    }
  }

  return {
    getHome: getHome,
    search: search,
    load: load,
    loadStreams: loadStreams
  };
})();

Object.assign(globalThis, PluginModule);
