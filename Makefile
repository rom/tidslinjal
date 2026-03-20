.PHONY: build test lint lint-go lint-js vet e2e clean test-perf test-fuzz test-all

build:
	go build -o tidslinjal ./...

test:
	go test -short ./...
	node tests/js/test_utils.js

test-all:
	./tests/run_tests.sh all

test-perf:
	go test -count=1 -timeout 300s -run 'TestPerformance' -v ./...
	go test -bench=. -benchmem -benchtime=3s -run='^$$' -timeout 300s ./...

test-fuzz:
	@echo "Running fuzz tests (30s each)..."
	@for func in $$(grep -h '^func Fuzz' ./*_test.go | sed 's/func \(Fuzz[A-Za-z0-9_]*\).*/\1/'); do \
		echo "  Fuzzing: $$func"; \
		go test -fuzz="^$${func}$$" -fuzztime=30s -timeout 120s ./... || true; \
	done

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
