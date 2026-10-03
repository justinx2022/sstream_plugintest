var PluginModule = (() => {
  const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://yoturkish.to/"
  };

  async function getHome(callback) {
    try {
      let res = await http_get("https://yoturkish.to/series/", defaultHeaders);
      if (!res || !res.body) {
        return callback({ success: false, errorCode: "SITE_OFFLINE", message: "No response from site" });
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
          title: m[2].trim(),
          url: u,
          posterUrl: m[3].trim(),
          type: "series"
        }));
      }

      callback({
        success: true,
        data: {
          "Turkish Series": items
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
          title: m[2].trim(),
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
      let titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      let title = titleMatch ? titleMatch[1].trim() : "Unknown";

      let imgMatch = html.match(/class="poster"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
      let posterUrl = imgMatch ? imgMatch[1].trim() : "";

      let descMatch = html.match(/<div class="entry-content">([\s\S]*?)<\/div>/i);
      let description = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      let epRegex = /<a\s+class="episod"\s+href="([^"]+)">([\s\S]*?)<\/a>/gi;
      let episodes = [];
      let em;
      let epNum = 1;
      let seen = new Set();

      while ((em = epRegex.exec(html)) !== null) {
        let epUrl = em[1].trim();
        if (seen.has(epUrl)) continue;
        seen.add(epUrl);

        let epName = em[2].replace(/<[^>]+>/g, "").trim() || ("Episode " + epNum);
        episodes.push(new Episode({
          name: epName,
          season: 1,
          episode: epNum,
          posterUrl: posterUrl,
          url: epUrl
        }));
        epNum++;
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

        // Check for iframes
        let iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let im;
        while ((im = iframeRegex.exec(html)) !== null) {
          let src = im[1].trim();
          if (src && !src.includes("ads") && !src.includes("doubleclick")) {
            streams.push(new StreamResult({
              source: "YoTurkish Stream",
              name: "Server",
              url: src,
              quality: 1080,
              headers: { "Referer": episodeUrl }
            }));
          }
        }

        // Check for any direct media links
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

      // Fallback: direct episode link
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
