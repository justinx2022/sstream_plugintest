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

  function normalizeEmbedUrl(url, baseUrl) {
    let value = String(url || "")
      .replace(/&amp;/g, "&")
      .replace(/&#038;/g, "&")
      .replace(/&quot;/g, '"')
      .trim();
    if (value.startsWith("//")) return "https:" + value;
    if (value.startsWith("/")) {
      let origin = String(baseUrl || "").match(/^(https?:\/\/[^/]+)/i);
      return origin ? origin[1] + value : value;
    }
    return value;
  }

  function withServer(url, server) {
    let clean = String(url || "").replace(/([?&])server=[^&#]*&?/i, "$1");
    clean = clean.replace(/[?&]$/, "");
    let hash = "";
    let hashAt = clean.indexOf("#");
    if (hashAt >= 0) {
      hash = clean.substring(hashAt);
      clean = clean.substring(0, hashAt);
    }
    return clean + (clean.includes("?") ? "&" : "?") + "server=" + encodeURIComponent(server) + hash;
  }

  function collectMedia(body, referer, streams, seen, sourceName) {
    let regex = /https?:\/\/[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?/gi;
    let match;
    while ((match = regex.exec(String(body || ""))) !== null) {
      let mediaUrl = match[0].replace(/[),;]+$/, "");
      if (seen.has(mediaUrl)) continue;
      seen.add(mediaUrl);
      let isHls = /\.m3u8(?:\?|$)/i.test(mediaUrl);
      streams.push(new StreamResult({
        source: sourceName + (isHls ? " Direct HLS" : " Direct MP4"),
        name: isHls ? "Direct HLS" : "Direct MP4",
        url: mediaUrl,
        quality: "Auto",
        type: isHls ? "m3u8" : "mp4",
        headers: {
          "Referer": referer,
          "User-Agent": defaultHeaders["User-Agent"]
        }
      }));
    }
  }

  function iframeUrls(body, baseUrl) {
    let result = [];
    let regex = /<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi;
    let match;
    while ((match = regex.exec(String(body || ""))) !== null) {
      let value = normalizeEmbedUrl(match[2], baseUrl);
      if (value && !result.includes(value)) result.push(value);
    }
    return result;
  }

  async function loadStreams(episodeUrl, callback) {
    try {
      let streams = [];
      let res = await http_get(episodeUrl, defaultHeaders);

      if (!res || !res.body) throw new Error("WLEXT episode page returned no content.");

      let html = res.body;
      let serverOpts = [];
      let sMatch = html.match(/<select\b(?=[^>]*(?:id=["']servers["']|name=["']server["']))[^>]*>([\s\S]*?)<\/select>/i);
      if (sMatch) {
        let optRegex = /<option\b[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
        let option;
        while ((option = optRegex.exec(sMatch[1])) !== null) {
          let value = option[1].trim();
          if (value && !/select/i.test(value) && !serverOpts.includes(value)) serverOpts.push(value);
        }
      }

      let pages = [{ body: html, url: episodeUrl, referer: "https://wlext.is/" }];
      // WLEXT replaces the player iframe when ?server=<option> is selected.
      // Fetch every server advertised by the episode, including current SOAP
      // BOX and HYDRA values, instead of relying on obsolete hard-coded IDs.
      let serverPages = await Promise.all(serverOpts.map(async (server) => {
        try {
          let serverUrl = withServer(episodeUrl, server);
          let serverRes = await http_get(serverUrl, defaultHeaders);
          if (serverRes && serverRes.body) {
            return { body: serverRes.body, url: serverUrl, referer: "https://wlext.is/" };
          }
        } catch (serverError) {}
        return null;
      }));
      pages.push(...serverPages.filter(Boolean));

      let seenFrames = new Set();
      let seenUrls = new Set();
      for (let page of pages) {
        collectMedia(page.body, page.referer, streams, seenUrls, "WLEXT");
        for (let iframe of iframeUrls(page.body, page.url)) {
          if (seenFrames.has(iframe)) continue;
          seenFrames.add(iframe);

          if (iframe.includes("elitecloud.top/")) {
            iframe = iframe.replace("elitecloud.top/", "elite.rpmhub.site/");
          }
          if (iframe.includes("ok.ru/videoembed/")) {
            await extractOkRu(iframe, streams);
            continue;
          }

          // Scrape static provider embeds for direct media and one nested
          // iframe level. SOAP BOX serves a JavaScript player shell rather
          // than a media URL, so don't hand its HTML page to the video player.
          if (/sobox\.top/i.test(iframe)) continue;
          try {
            let embedRes = await http_get(iframe, {
              "User-Agent": defaultHeaders["User-Agent"],
              "Referer": page.url
            });
            if (!embedRes || !embedRes.body) continue;
            let embedBase = embedRes.finalUrl || iframe;
            collectMedia(embedRes.body, embedBase, streams, seenUrls, "WLEXT Provider");
            for (let nested of iframeUrls(embedRes.body, embedBase)) {
              if (seenFrames.has(nested) || nested.includes("sobox.top")) continue;
              seenFrames.add(nested);
              if (nested.includes("ok.ru/videoembed/")) {
                await extractOkRu(nested, streams);
                continue;
              }
              try {
                let nestedRes = await http_get(nested, {
                  "User-Agent": defaultHeaders["User-Agent"],
                  "Referer": embedBase
                });
                if (nestedRes && nestedRes.body) {
                  collectMedia(nestedRes.body, nestedRes.finalUrl || nested, streams, seenUrls, "WLEXT Provider");
                }
              } catch (nestedError) {}
            }
          } catch (embedError) {}
        }
      }

      if (callback && typeof callback === "function") {
        callback(streams.length
          ? { success: true, data: streams }
          : { success: false, errorCode: "STREAMS_UNAVAILABLE", message: "WLEXT listed servers, but none exposed a playable media URL. SOAP BOX currently uses a JavaScript player, and the advertised HYDRA link may be unavailable." });
      }
      return streams;
    } catch (e) {
      if (callback && typeof callback === "function") {
        callback({ success: false, errorCode: "STREAMS_UNAVAILABLE", message: e.message || "WLEXT did not return a playable server." });
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
