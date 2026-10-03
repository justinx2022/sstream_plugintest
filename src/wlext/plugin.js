var PluginModule = (() => {
  const defaultHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://wlext.is/"
  };

  function cleanString(str) {
    if (!str) return "";
    return String(str)
      .replace(/<[^>]+>/g, "")
      .replace(/&#8211;/g, "-")
      .replace(/&#8217;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseCards(html) {
    const regex = /<a\s+[^>]*href="(https:\/\/wlext\.is\/series\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    const items = [];
    const seen = new Set();
    while ((m = regex.exec(html)) !== null) {
      const url = m[1].trim();
      if (seen.has(url)) continue;

      const tag = m[0];
      const inner = m[2];

      const tm = tag.match(/title="([^"]+)"/i) || 
                 tag.match(/alt="([^"]+)"/i) || 
                 inner.match(/title="([^"]+)"/i) || 
                 inner.match(/alt="([^"]+)"/i);
      const rawTitle = tm ? tm[1] : "";
      const cleanTitle = cleanString(rawTitle);
      if (!cleanTitle) continue;

      const im = inner.match(/data-lazy-src="([^"]+)"/i) || inner.match(/src="([^"]+)"/i);
      let poster = im ? im[1].trim() : "";
      if (poster.startsWith("data:image")) {
        const im2 = inner.match(/data-lazy-srcset="([^",\s]+)/i);
        poster = im2 ? im2[1].trim() : "";
      }

      seen.add(url);
      items.push(new MultimediaItem({
        title: cleanTitle,
        url: url,
        posterUrl: poster,
        type: "series"
      }));
    }
    return items;
  }

  async function getHome(callback) {
    try {
      // 1. Featured Telenovelas from /telenovela-world-1/
      let featured = [];
      try {
        let res1 = await http_get("https://wlext.is/telenovela-world-1/", defaultHeaders);
        if (res1 && res1.body) {
          featured = parseCards(res1.body);
        }
      } catch (e1) {}

      // 2. Catalog from /genre/telenovela/
      let catalog = [];
      try {
        let res2 = await http_get("https://wlext.is/genre/telenovela/", defaultHeaders);
        if (res2 && res2.body) {
          catalog = parseCards(res2.body);
        }
      } catch (e2) {}

      let homeData = {
        "Featured Telenovelas": featured,
        "Telenovela World": catalog
      };

      if (callback && typeof callback === "function") {
        callback({ success: true, data: homeData });
      }
      return homeData;
    } catch (e) {
      if (callback && typeof callback === "function") {
        callback({ success: false, errorCode: "FETCH_ERROR", message: e.message || String(e) });
      }
      return { "Featured Telenovelas": [], "Telenovela World": [] };
    }
  }

  async function search(query, callback) {
    try {
      let searchUrl = "https://wlext.is/?s=" + encodeURIComponent(query);
      let res = await http_get(searchUrl, defaultHeaders);
      if (!res || !res.body) {
        if (callback && typeof callback === "function") callback({ success: true, data: [] });
        return [];
      }

      let html = res.body;
      let regex = /<article[\s\S]*?<\/article>/gi;
      let m;
      let items = [];
      let seen = new Set();

      while ((m = regex.exec(html)) !== null) {
        let art = m[0];
        let lm = art.match(/<h2 class="entry-title">\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
                 art.match(/<a\s+[^>]*href="([^"]+)"[^>]*title="([^"]+)"/i);
        if (!lm) continue;

        let u = lm[1].trim();
        if (!u.includes("/series/")) continue;
        if (seen.has(u)) continue;
        seen.add(u);

        let title = cleanString(lm[2]);
        let im = art.match(/data-lazy-src="([^"]+)"/i) || art.match(/src="([^"]+)"/i);
        let poster = im ? im[1].trim() : "";
        if (poster.startsWith("data:image")) {
          let im2 = art.match(/data-lazy-srcset="([^",\s]+)/i);
          poster = im2 ? im2[1].trim() : "";
        }

        items.push(new MultimediaItem({
          title: title,
          url: u,
          posterUrl: poster,
          type: "series"
        }));
      }

      // Fallback to parseCards if no articles matched
      if (items.length === 0) {
        items = parseCards(html).filter(it => it.url && it.url.includes("/series/"));
      }

      if (callback && typeof callback === "function") callback({ success: true, data: items });
      return items;
    } catch (e) {
      if (callback && typeof callback === "function") callback({ success: true, data: [] });
      return [];
    }
  }

  async function load(url, callback) {
    try {
      let res = await http_get(url, defaultHeaders);
      if (!res || !res.body) {
        if (callback && typeof callback === "function") callback({ success: false, errorCode: "PARSE_ERROR", message: "Failed to load page" });
        return null;
      }

      let html = res.body;
      let titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                       html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      let title = titleMatch ? cleanString(titleMatch[1]) : "Unknown Telenovela";

      let posterUrl = "";
      let imgRegex = /<img[^>]+(?:data-lazy-src|src)="([^"]+)"/gi;
      let im;
      while ((im = imgRegex.exec(html)) !== null) {
        let src = im[1].trim();
        if (src.includes("data:image")) continue;
        if (src.includes("LOGO") || src.includes("VIP") || src.includes("sticker") || src.includes("icon") || src.includes("banner")) continue;
        if (src.includes("/uploads/")) {
          posterUrl = src;
          break;
        }
      }

      let descMatch = html.match(/<div class="entry-content">([\s\S]*?)<\/div>/i);
      let description = descMatch ? cleanString(descMatch[1]) : "";

      let epSelectMatch = html.match(/<select[^>]*id="loadepisode"[^>]*>([\s\S]*?)<\/select>/i);
      let episodes = [];

      if (epSelectMatch) {
        let optRegex = /<option[^>]+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
        let om;
        let epIndex = 1;
        let seenEps = new Set();

        while ((om = optRegex.exec(epSelectMatch[1])) !== null) {
          let val = om[1].trim();
          let epRaw = cleanString(om[2]);
          if (!val || val.includes("select") || val.includes("server")) continue;

          let numMatch = epRaw.match(/(\d+)/) || val.match(/(\d+)/);
          let epNum = numMatch ? parseInt(numMatch[1], 10) : epIndex;

          let sep = url.includes("?") ? "&" : "?";
          let epFullUrl = url + sep + val;
          if (seenEps.has(epFullUrl)) continue;
          seenEps.add(epFullUrl);

          episodes.push(new Episode({
            name: epRaw || ("Episode " + epNum),
            season: 1,
            episode: epNum,
            posterUrl: posterUrl,
            url: epFullUrl
          }));
          epIndex++;
        }
      }

      // Standalone single episode fallback if no episode dropdown exists
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

      if (callback && typeof callback === "function") callback({ success: true, data: item });
      return item;
    } catch (e) {
      if (callback && typeof callback === "function") callback({ success: false, errorCode: "PARSE_ERROR", message: e.message || String(e) });
      return null;
    }
  }

  async function extractOkRu(embedUrl, streams) {
    try {
      let cleanUrl = embedUrl;
      if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl;
      let res = await http_get(cleanUrl, {
        "User-Agent": defaultHeaders["User-Agent"],
        "Referer": "https://ok.ru/"
      });
      if (!res || !res.body) return;

      let html = res.body;
      let optMatch = html.match(/data-options="([^"]+)"/i);
      if (!optMatch) return;

      let rawOpt = optMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      let opt = JSON.parse(rawOpt);
      if (opt.flashvars && opt.flashvars.metadata) {
        let meta = typeof opt.flashvars.metadata === "string" 
          ? JSON.parse(opt.flashvars.metadata) 
          : opt.flashvars.metadata;

        // 1. Master Adaptive HLS Stream (1080p Auto)
        if (meta.hlsManifestUrl) {
          streams.push(new StreamResult({
            source: "WLEXT OK.ru (HLS Auto 1080p)",
            name: "OK.ru Auto FHD",
            url: meta.hlsManifestUrl,
            quality: "1080p",
            type: "m3u8",
            headers: {
              "Referer": "https://ok.ru/",
              "User-Agent": defaultHeaders["User-Agent"]
            }
          }));
        }

        // 2. Direct MP4 Streams
        if (Array.isArray(meta.videos)) {
          for (let v of meta.videos) {
            if (!v.url) continue;
            let q = "480p";
            if (v.name === "full") q = "1080p";
            else if (v.name === "hd") q = "720p";
            else if (v.name === "sd") q = "480p";
            else if (v.name === "low") q = "360p";
            else if (v.name === "lowest") q = "240p";
            else if (v.name === "mobile") q = "144p";

            streams.push(new StreamResult({
              source: "WLEXT OK.ru (" + q + " Direct)",
              name: "OK.ru " + q,
              url: v.url,
              quality: q,
              type: "mp4",
              headers: {
                "Referer": "https://ok.ru/",
                "User-Agent": defaultHeaders["User-Agent"]
              }
            }));
          }
        }
      }
    } catch (err) {}
  }

  async function loadStreams(episodeUrl, callback) {
    try {
      let streams = [];
      let res = await http_get(episodeUrl, defaultHeaders);

      if (res && res.body) {
        let html = res.body;

        // 1. Discover all servers listed in <select name="server">
        let serverOpts = [];
        let sMatch = html.match(/<select[^>]*name="server"[^>]*>([\s\S]*?)<\/select>/i);
        if (sMatch) {
          let optRegex = /<option[^>]+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi;
          let om;
          while ((om = optRegex.exec(sMatch[1])) !== null) {
            let val = om[1].trim();
            if (val && !val.includes("select")) {
              serverOpts.push(val);
            }
          }
        }

        // 2. Collect iframes from default page
        let iframes = [];
        let ifMatch = [...html.matchAll(/<iframe[^>]+src="([^"]+)"/gi)];
        for (let im of ifMatch) {
          iframes.push(im[1].trim());
        }

        // 3. If OK.ru is available in server options, fetch its iframe
        if (serverOpts.includes("okru")) {
          try {
            let sep = episodeUrl.includes("?") ? "&" : "?";
            let okUrl = episodeUrl + sep + "server=okru";
            let okRes = await http_get(okUrl, defaultHeaders);
            if (okRes && okRes.body) {
              let okIframes = [...okRes.body.matchAll(/<iframe[^>]+src="([^"]+)"/gi)];
              for (let oim of okIframes) {
                iframes.push(oim[1].trim());
              }
            }
          } catch (e) {}
        }

        // 4. Also check ommatop server if listed
        if (serverOpts.includes("ommatop")) {
          try {
            let sep = episodeUrl.includes("?") ? "&" : "?";
            let ommaUrl = episodeUrl + sep + "server=ommatop";
            let ommaRes = await http_get(ommaUrl, defaultHeaders);
            if (ommaRes && ommaRes.body) {
              let ommaIframes = [...ommaRes.body.matchAll(/<iframe[^>]+src="([^"]+)"/gi)];
              for (let oim of ommaIframes) {
                iframes.push(oim[1].trim());
              }
            }
          } catch (e) {}
        }

        // 5. Process discovered iframe targets
        for (let iframe of iframes) {
          if (!iframe) continue;

          // Domain rewrite according to WLEXT script:
          if (iframe.includes("elitecloud.top/")) {
            iframe = iframe.replace("elitecloud.top/", "elite.rpmhub.site/");
          }

          // A. OK.ru extractor
          if (iframe.includes("ok.ru/videoembed/")) {
            await extractOkRu(iframe, streams);
          }
        }

        // 6. Direct media links scan in page HTML
        let mediaRegex = /https?:\/\/[^"'\s<>]+\.(?:m3u8|mp4)[^"'\s<>]*/gi;
        let mm;
        let seenUrls = new Set(streams.map(s => s.url));
        while ((mm = mediaRegex.exec(html)) !== null) {
          let mUrl = mm[0].trim();
          if (mUrl.includes(".m3u8") && !seenUrls.has(mUrl)) {
            seenUrls.add(mUrl);
            streams.push(new StreamResult({
              source: "WLEXT Direct HLS",
              name: "Direct FHD (1080p)",
              url: mUrl,
              quality: "1080p",
              type: "m3u8",
              headers: {
                "Referer": "https://wlext.is/",
                "User-Agent": defaultHeaders["User-Agent"]
              }
            }));
          } else if (mUrl.includes(".mp4") && !seenUrls.has(mUrl)) {
            seenUrls.add(mUrl);
            streams.push(new StreamResult({
              source: "WLEXT Direct MP4",
              name: "Direct MP4 (1080p)",
              url: mUrl,
              quality: "1080p",
              type: "mp4",
              headers: {
                "Referer": "https://wlext.is/",
                "User-Agent": defaultHeaders["User-Agent"]
              }
            }));
          }
        }
      }

      if (callback && typeof callback === "function") {
        callback({ success: true, data: streams });
      }
      return streams;
    } catch (e) {
      if (callback && typeof callback === "function") {
        callback({ success: true, data: [] });
      }
      return [];
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
