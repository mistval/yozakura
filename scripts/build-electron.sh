#!/bin/bash

npm --prefix server run build -- --outDir ../electron/server_build/
cp -r ./server/node_modules ./electron/server_build/
npm --prefix client run build -- --outDir ../electron/client_build/
