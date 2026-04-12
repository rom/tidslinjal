package main

import (
	"strings"
	"testing"
)

func TestSanitizeRichHTMLXSS(t *testing.T) {
	cases := []struct {
		in        string
		mustNotContain []string
	}{
		{`<b>hello</b> <script>alert(1)</script> world`, []string{"<script", "alert(1)"}},
		{`<img src=x onerror=alert(1)>`, []string{"onerror", "alert(1)"}},
		{`<img/onerror=alert(1) src=x>`, []string{"onerror", "alert(1)"}},
		{`<IMG SRC="javascript:alert(1)">`, []string{"javascript:", "alert(1)"}},
		{`<a href="javascript:alert(1)">click</a>`, []string{"javascript:", "alert(1)"}},
		{`<a href="JaVaScRiPt:alert(1)">click</a>`, []string{"javascript:", "JaVaScRiPt:", "alert(1)"}},
		{`<a href="data:text/html,foo">click</a>`, []string{"data:text/html"}},
		{`<svg><script>alert(1)</script></svg>`, []string{"<svg", "<script", "alert(1)"}},
		{`<svg onload=alert(1)>`, []string{"<svg", "onload", "alert(1)"}},
		{`<div style="background:url(javascript:alert(1))">text</div>`, []string{"javascript:", "style="}},
		{`<!--<script>x</script>-->`, []string{"<script", "<!--"}},
		{`<iframe src="javascript:alert(1)">`, []string{"<iframe", "javascript:"}},
		{`<p onclick="alert(1)">text</p>`, []string{"onclick", "alert(1)"}},
	}
	for _, c := range cases {
		got := sanitizeRichHTML(c.in)
		for _, bad := range c.mustNotContain {
			if strings.Contains(strings.ToLower(got), strings.ToLower(bad)) {
				t.Errorf("sanitizeRichHTML(%q) = %q, must not contain %q", c.in, got, bad)
			}
		}
	}
}
