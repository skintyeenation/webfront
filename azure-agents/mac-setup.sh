#!/bin/bash
set -e
# Install socat to fix networking issues
brew install socat
socat TCP-LISTEN:2375,reuseaddr,fork,bind=127.0.0.1 UNIX-CLIENT:/var/run/docker.sock &
# Install ruby for fastlane builds
brew install rbenv ruby-build
rbenv install 3.2.6
rbenv global 3.2.6