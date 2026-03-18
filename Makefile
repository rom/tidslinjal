.PHONY: build test lint lint-go lint-js vet e2e clean

build:
	go build -o tidslinjal ./...

test:
	go test -short ./...
	node tests/js/test_utils.js

vet:
	go vet ./...

lint: lint-go lint-js

lint-go:
	golangci-lint run ./...

lint-js:
	npx eslint static/*.js

e2e:
	cd tests/e2e && npx playwright test

clean:
	rm -f tidslinjal
