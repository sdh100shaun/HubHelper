const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');
const markdownIt = require('markdown-it');
const markdownItAnchor = require('markdown-it-anchor');

module.exports = (eleventyConfig) => {
  // Add plugins
  eleventyConfig.addPlugin(syntaxHighlight);

  // Configure Markdown
  const markdownOptions = {
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
  };

  const markdownLib = markdownIt(markdownOptions).use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.ariaHidden({
      placement: 'after',
      class: 'header-anchor',
      symbol: '#',
    }),
    level: [1, 2, 3, 4],
    slugify: eleventyConfig.getFilter('slugify'),
  });

  eleventyConfig.setLibrary('md', markdownLib);

  // Pass through assets
  eleventyConfig.addPassthroughCopy('docs/assets');
  eleventyConfig.addPassthroughCopy({ 'docs/assets/css': 'css' });
  eleventyConfig.addPassthroughCopy({ 'docs/assets/js': 'js' });
  eleventyConfig.addPassthroughCopy({ 'docs/assets/images': 'images' });

  // Add custom filters
  eleventyConfig.addFilter('dateDisplay', (dateObj) => {
    return new Date(dateObj).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  });

  // Add year shortcode for copyright
  eleventyConfig.addShortcode('year', () => `${new Date().getFullYear()}`);

  // Add navigation collection
  eleventyConfig.addCollection('navigation', (collectionApi) =>
    collectionApi.getAll().filter((item) => item.data.nav)
  );

  // Watch targets
  eleventyConfig.addWatchTarget('docs/assets/css/');
  eleventyConfig.addWatchTarget('docs/assets/js/');

  // Browser Sync config
  eleventyConfig.setBrowserSyncConfig({
    files: ['./_site/css/**/*.css', './_site/js/**/*.js'],
  });

  // Add pathPrefix filter for GitHub Pages compatibility
  eleventyConfig.addFilter('url', (url) => {
    const prefix = process.env.ELEVENTY_PATH_PREFIX || '/HubHelper';
    if (url.startsWith('/')) {
      return prefix + url;
    }
    return url;
  });

  return {
    pathPrefix: process.env.ELEVENTY_PATH_PREFIX || '/HubHelper/',
    dir: {
      input: 'docs',
      output: '_site',
      includes: '_includes',
      layouts: '_includes/layouts',
      data: '_data',
    },
    templateFormats: ['md', 'njk', 'html', 'liquid'],
    markdownTemplateEngine: 'njk',
    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk',
  };
};
