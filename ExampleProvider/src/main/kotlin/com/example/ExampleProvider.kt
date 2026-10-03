package com.example

import com.lagradost.cloudstream3.*
import com.lagradost.cloudstream3.utils.*

class ExampleProvider : MainAPI() {
    override var mainUrl = "https://yoturkish.to"
    override var name = "YoTurkish"
    override val supportedTypes = setOf(TvType.TvSeries)
    override var lang = "tr"
    override val hasMainPage = true

    // 1. Homepage & Sections
    override val mainPage = mainPageOf(
        "$mainUrl/series/" to "All Series",
        "$mainUrl/" to "Latest Updates"
    )

    override suspend fun getMainPage(page: Int, request: MainPageRequest): HomePageResponse {
        val url = if (page > 1) "${request.data}page/$page/" else request.data
        val document = app.get(url).document

        val items = document.select("div.item").mapNotNull { card ->
            val linkTag = card.selectFirst("a.poster") ?: return@mapNotNull null
            val title = linkTag.attr("title").trim()
            val href = linkTag.attr("href")
            val poster = card.selectFirst("img")?.attr("src")

            newTvSeriesSearchResponse(title, fixUrl(href), TvType.TvSeries) {
                this.posterUrl = poster
            }
        }
        return newHomePageResponse(request.name, items)
    }

    // 2. Search
    override suspend fun search(query: String): List<SearchResponse> {
        val document = app.get("$mainUrl/?s=$query").document

        return document.select("div.item").mapNotNull { card ->
            val linkTag = card.selectFirst("a.poster") ?: return@mapNotNull null
            val title = linkTag.attr("title").trim()
            val href = linkTag.attr("href")
            val poster = card.selectFirst("img")?.attr("src")

            newTvSeriesSearchResponse(title, fixUrl(href), TvType.TvSeries) {
                this.posterUrl = poster
            }
        }
    }

    // 3. Load Details & Episode List
    override suspend fun load(url: String): LoadResponse {
        val document = app.get(url).document
        val title = document.selectFirst("h1")?.text().orEmpty().trim()
        val poster = document.selectFirst(".play, .poster img")?.attr("src")
        val plot = document.selectFirst(".watch-extra")?.text()?.trim()

        val episodes = document.select("div#episodes a.episod").mapIndexed { index, ep ->
            val epHref = ep.attr("href")
            val epName = ep.text().trim()
            Episode(
                data = fixUrl(epHref),
                name = epName.ifBlank { "Episode ${index + 1}" },
                episode = index + 1
            )
        }

        return newTvSeriesLoadResponse(title, url, TvType.TvSeries, episodes) {
            this.posterUrl = poster
            this.plot = plot
        }
    }

    // 4. Resolve Video Embed Links
    override suspend fun loadLinks(
        data: String,
        isCasting: Boolean,
        subtitleCallback: (SubtitleFile) -> Unit,
        callback: (ExtractorLink) -> Unit
    ): Boolean {
        val document = app.get(data).document

        // Extract every iframe found inside the player container
        val iframes = document.select("div#player iframe").map { it.attr("src") }
        for (iframeUrl in iframes) {
            val fixed = fixUrl(iframeUrl)
            // loadExtractor automatically checks CloudStream's built-in extractors
            loadExtractor(fixed, subtitleCallback, callback)
        }
        return true
    }
}