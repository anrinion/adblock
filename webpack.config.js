const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: {
        background: './src/background.js',
        content: './src/content.js',
        popup: './src/popup.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env']
                    }
                }
            },
            {
                test: /\.json$/,
                type: 'json'
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.json']
    },
    optimization: {
        splitChunks: {
            chunks: 'all'
        }
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: './src/icons', to: 'icons' },
                './src/manifest.json',
                './src/popup.html',
            ]
        }),
        new ZipPlugin({
            filename: 'chrome-extension.zip'
        })
    ]
};
