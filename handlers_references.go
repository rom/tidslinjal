package main

import (
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ── Reference Document handlers ────────────────────────────────────────────────

func (app *App) handleListReferences(w http.ResponseWriter, r *http.Request, user *User) {
	jsonOK(w, app.store.GetReferenceDocs())
}

func (app *App) handleGetReference(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	rd, ok := app.store.GetReferenceDoc(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, rd)
}

func (app *App) handleUploadReference(w http.ResponseWriter, r *http.Request, user *User) {
	if err := r.ParseMultipartForm(50 << 20); err != nil { // 50 MB
		jsonError(w, "file too large (max 50 MB)", http.StatusBadRequest)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file field missing", http.StatusBadRequest)
		return
	}
	defer file.Close()

	safeFilename := filepath.Base(header.Filename)
	if safeFilename == "." || safeFilename == "/" {
		safeFilename = "upload"
	}
	storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeFilename)
	destPath := filepath.Join(app.store.ReferenceDir(), storedName)
	dst, err := os.Create(destPath)
	if err != nil {
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}
	written, err := io.Copy(dst, file)
	dst.Close()
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save file", http.StatusInternalServerError)
		return
	}

	mimeType := mime.TypeByExtension(filepath.Ext(header.Filename))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	title := r.FormValue("title")
	if title == "" {
		title = safeFilename
	}

	category := r.FormValue("category")
	if category == "" {
		category = "other"
	}

	var tags []string
	if t := r.FormValue("tags"); t != "" {
		for _, tag := range strings.Split(t, ",") {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				tags = append(tags, tag)
			}
		}
	}

	// Compute checksums for the uploaded file
	var csumMD5, csumSHA1, csumSHA256, csumSHA512 string
	if fdata, ferr := os.ReadFile(destPath); ferr == nil {
		csumMD5 = fmt.Sprintf("%x", md5.Sum(fdata))
		csumSHA1 = fmt.Sprintf("%x", sha1.Sum(fdata))
		h256 := sha256.Sum256(fdata)
		csumSHA256 = hex.EncodeToString(h256[:])
		h512 := sha512.Sum512(fdata)
		csumSHA512 = hex.EncodeToString(h512[:])
	}

	// Detect file type from extension
	detectedType := ""
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(safeFilename)), ".")
	if ext != "" {
		detectedType = ext
	}

	rd := ReferenceDoc{
		Title:          title,
		Description:    r.FormValue("description"),
		Category:       category,
		Filename:       storedName,
		OriginalName:   safeFilename,
		ContentType:    mimeType,
		Size:           written,
		UploadedBy:     user.ID,
		UploadedByName: user.DisplayName,
		UploadedAt:     time.Now(),
		Tags:           tags,
		Language:       r.FormValue("language"),
		DetectedType:   detectedType,
		CopyMode:       r.FormValue("copy_mode"),
		Owner:          r.FormValue("owner"),
		Authors:        r.FormValue("authors"),
		Custodian:      r.FormValue("custodian"),
		ChecksumMD5:    csumMD5,
		ChecksumSHA1:   csumSHA1,
		ChecksumSHA256: csumSHA256,
		ChecksumSHA512: csumSHA512,
	}

	created, err := app.store.AddReferenceDoc(rd)
	if err != nil {
		os.Remove(destPath)
		jsonError(w, "failed to save reference", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, created)
}

func (app *App) handleDownloadReference(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	rd, ok := app.store.GetReferenceDoc(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Handle URL-type references that have no stored file
	if rd.Filename == "" {
		if rd.RefType == "url" && rd.URL != "" {
			// Validate URL scheme to prevent open redirect to javascript:/data: etc.
			parsedURL, parseErr := url.Parse(rd.URL)
			if parseErr != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
				jsonError(w, "invalid reference URL", http.StatusBadRequest)
				return
			}
			http.Redirect(w, r, rd.URL, http.StatusFound)
			return
		}
		if rd.RefType == "local" && rd.Content != "" {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Content-Disposition", "inline")
			w.Write([]byte(rd.Content))
			return
		}
		jsonError(w, "no file stored for this reference", http.StatusNotFound)
		return
	}
	filePath := filepath.Join(app.store.ReferenceDir(), rd.Filename)
	ct := rd.ContentType
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	safeDisp := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, rd.OriginalName)
	// Support inline display via ?inline=1 query parameter
	if r.URL.Query().Get("inline") == "1" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, safeDisp))
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeDisp))
	}
	http.ServeFile(w, r, filePath)
}

func (app *App) handleUpdateReference(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	rd, ok := app.store.GetReferenceDoc(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	var req struct {
		Title       *string  `json:"title"`
		Description *string  `json:"description"`
		Category    *string  `json:"category"`
		Tags        []string `json:"tags"`
		Language    *string  `json:"language"`
		CopyMode   *string  `json:"copy_mode"`
		Owner      *string  `json:"owner"`
		Authors    *string  `json:"authors"`
		Custodian  *string  `json:"custodian"`
	}
	if err := decode(r, &req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Title != nil {
		rd.Title = *req.Title
	}
	if req.Description != nil {
		rd.Description = *req.Description
	}
	if req.Category != nil {
		rd.Category = *req.Category
	}
	if req.Tags != nil {
		rd.Tags = req.Tags
	}
	if req.Language != nil {
		rd.Language = *req.Language
	}
	if req.CopyMode != nil {
		rd.CopyMode = *req.CopyMode
	}
	if req.Owner != nil {
		rd.Owner = *req.Owner
	}
	if req.Authors != nil {
		rd.Authors = *req.Authors
	}
	if req.Custodian != nil {
		rd.Custodian = *req.Custodian
	}
	if err := app.store.UpdateReferenceDoc(rd); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, rd)
}

func (app *App) handleDeleteReference(w http.ResponseWriter, r *http.Request, user *User) {
	id, err := pathID(r)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	rd, ok := app.store.GetReferenceDoc(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// Remove file from disk
	os.Remove(filepath.Join(app.store.ReferenceDir(), rd.Filename))
	if err := app.store.DeleteReferenceDoc(id); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleBulkUploadReferences handles uploading multiple reference files at once
func (app *App) handleBulkUploadReferences(w http.ResponseWriter, r *http.Request, user *User) {
	if err := r.ParseMultipartForm(200 << 20); err != nil { // 200 MB
		jsonError(w, "files too large (max 200 MB total)", http.StatusBadRequest)
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		jsonError(w, "no files provided", http.StatusBadRequest)
		return
	}
	category := r.FormValue("category")
	if category == "" {
		category = "other"
	}
	language := r.FormValue("language")
	owner := r.FormValue("owner")
	custodian := r.FormValue("custodian")

	var results []ReferenceDoc
	for _, header := range files {
		file, err := header.Open()
		if err != nil {
			continue
		}
		safeFilename := filepath.Base(header.Filename)
		if safeFilename == "." || safeFilename == "/" {
			safeFilename = "upload"
		}
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeFilename)
		destPath := filepath.Join(app.store.ReferenceDir(), storedName)
		dst, err := os.Create(destPath)
		if err != nil {
			file.Close()
			continue
		}
		written, err := io.Copy(dst, file)
		dst.Close()
		file.Close()
		if err != nil {
			os.Remove(destPath)
			continue
		}
		mimeType := mime.TypeByExtension(filepath.Ext(header.Filename))
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		// Compute checksums
		var csumMD5, csumSHA1, csumSHA256, csumSHA512 string
		if fdata, ferr := os.ReadFile(destPath); ferr == nil {
			csumMD5 = fmt.Sprintf("%x", md5.Sum(fdata))
			csumSHA1 = fmt.Sprintf("%x", sha1.Sum(fdata))
			h256 := sha256.Sum256(fdata)
			csumSHA256 = hex.EncodeToString(h256[:])
			h512 := sha512.Sum512(fdata)
			csumSHA512 = hex.EncodeToString(h512[:])
		}
		ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(safeFilename)), ".")
		rd := ReferenceDoc{
			Title:          safeFilename,
			Category:       category,
			Filename:       storedName,
			OriginalName:   safeFilename,
			ContentType:    mimeType,
			Size:           written,
			UploadedBy:     user.ID,
			UploadedByName: user.DisplayName,
			UploadedAt:     time.Now(),
			Language:       language,
			DetectedType:   ext,
			Owner:          owner,
			Custodian:      custodian,
			ChecksumMD5:    csumMD5,
			ChecksumSHA1:   csumSHA1,
			ChecksumSHA256: csumSHA256,
			ChecksumSHA512: csumSHA512,
		}
		created, err := app.store.AddReferenceDoc(rd)
		if err != nil {
			os.Remove(destPath)
			continue
		}
		results = append(results, created)
	}
	jsonOK(w, map[string]any{"uploaded": len(results), "references": results})
}

// handleReferenceChecksums returns checksums for a specific reference
func (app *App) handleReferenceChecksums(w http.ResponseWriter, r *http.Request, user *User) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		jsonError(w, "invalid path", http.StatusBadRequest)
		return
	}
	id, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	rd, ok := app.store.GetReferenceDoc(id)
	if !ok {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	// If checksums are missing, compute them now
	if rd.ChecksumMD5 == "" {
		filePath := filepath.Join(app.store.ReferenceDir(), rd.Filename)
		if fdata, ferr := os.ReadFile(filePath); ferr == nil {
			rd.ChecksumMD5 = fmt.Sprintf("%x", md5.Sum(fdata))
			rd.ChecksumSHA1 = fmt.Sprintf("%x", sha1.Sum(fdata))
			h256 := sha256.Sum256(fdata)
			rd.ChecksumSHA256 = hex.EncodeToString(h256[:])
			h512 := sha512.Sum512(fdata)
			rd.ChecksumSHA512 = hex.EncodeToString(h512[:])
			_ = app.store.UpdateReferenceDoc(rd)
		}
	}
	jsonOK(w, map[string]string{
		"md5":    rd.ChecksumMD5,
		"sha1":   rd.ChecksumSHA1,
		"sha256": rd.ChecksumSHA256,
		"sha512": rd.ChecksumSHA512,
	})
}

// handleReferenceIndex returns a structured index of all reference documents,
// grouped by category with summary statistics.
func (app *App) handleReferenceIndex(w http.ResponseWriter, r *http.Request, user *User) {
	refs := app.store.GetReferenceDocs()

	type IndexEntry struct {
		ID           int64    `json:"id"`
		Title        string   `json:"title"`
		Category     string   `json:"category"`
		RefType      string   `json:"ref_type,omitempty"`
		DetectedType string   `json:"detected_type,omitempty"`
		Language     string   `json:"language,omitempty"`
		Owner        string   `json:"owner,omitempty"`
		Authors      string   `json:"authors,omitempty"`
		Tags         []string `json:"tags,omitempty"`
		Size         int64    `json:"size,omitempty"`
		UploadedAt   string   `json:"uploaded_at,omitempty"`
		DownloadURL  string   `json:"download_url,omitempty"`
	}

	type CategoryGroup struct {
		Category string       `json:"category"`
		Count    int          `json:"count"`
		Entries  []IndexEntry `json:"entries"`
	}

	// Group by category
	catMap := make(map[string][]IndexEntry)
	catOrder := []string{"handbook", "sop", "policy", "map", "reference", "checklist", "faq", "objectives", "other"}
	for _, rd := range refs {
		cat := rd.Category
		if cat == "" {
			cat = "other"
		}
		entry := IndexEntry{
			ID:           rd.ID,
			Title:        rd.Title,
			Category:     cat,
			RefType:      rd.RefType,
			DetectedType: rd.DetectedType,
			Language:     rd.Language,
			Owner:        rd.Owner,
			Authors:      rd.Authors,
			Tags:         rd.Tags,
			Size:         rd.Size,
		}
		if !rd.UploadedAt.IsZero() {
			entry.UploadedAt = rd.UploadedAt.Format("2006-01-02T15:04:05Z")
		}
		if rd.RefType == "url" && rd.URL != "" {
			entry.DownloadURL = rd.URL
		} else if rd.RefType != "local" && rd.Filename != "" {
			entry.DownloadURL = fmt.Sprintf("/api/references/%d/download", rd.ID)
		}
		catMap[cat] = append(catMap[cat], entry)
	}

	groups := make([]CategoryGroup, 0, len(catMap))
	// Add in canonical order first
	for _, c := range catOrder {
		if entries, ok := catMap[c]; ok {
			groups = append(groups, CategoryGroup{Category: c, Count: len(entries), Entries: entries})
			delete(catMap, c)
		}
	}
	// Any remaining categories
	for c, entries := range catMap {
		groups = append(groups, CategoryGroup{Category: c, Count: len(entries), Entries: entries})
	}

	// Collect unique languages and tags
	langSet := make(map[string]bool)
	tagSet := make(map[string]int)
	for _, rd := range refs {
		if rd.Language != "" {
			langSet[rd.Language] = true
		}
		for _, tg := range rd.Tags {
			tagSet[tg]++
		}
	}
	languages := make([]string, 0, len(langSet))
	for l := range langSet {
		languages = append(languages, l)
	}
	sort.Strings(languages)

	type TagCount struct {
		Tag   string `json:"tag"`
		Count int    `json:"count"`
	}
	tagCounts := make([]TagCount, 0, len(tagSet))
	for tg, cnt := range tagSet {
		tagCounts = append(tagCounts, TagCount{Tag: tg, Count: cnt})
	}
	sort.Slice(tagCounts, func(i, j int) bool { return tagCounts[i].Count > tagCounts[j].Count })

	jsonOK(w, map[string]any{
		"total_count": len(refs),
		"categories":  groups,
		"languages":   languages,
		"tags":        tagCounts,
	})
}
