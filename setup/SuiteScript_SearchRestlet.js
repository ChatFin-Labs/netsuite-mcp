/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
/*
 * Developed by ChatFin
 */

var log, search;
var defaultPageSize = 1000;
// eslint-disable-next-line no-undef
define(["N/log", "N/search"], function (logModule, searchModule) {
  log = logModule;
  search = searchModule;
  return {
    post: postProcess,
  };
});

/**
 * Request should contain type, filters, countOnly, maxResults, columns properties
 * type is the Search Type
 * countOnly is boolean to indicate whether only count is required
 * maxResults is to restrict results to small list
 * filters is array of arrays
 * columns is array of Objects with name, summary, label, sort, txt properties. txt property would determine, if you need Text value of the Colun
 */

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function postProcess(request) {
  var response = { success: true, data: { count: 0, items: [] }, error: {} };
  var debug = [];
  try {
    // Retrieve parameters from the request
    var _type = request.type;
    var _columns = request.columns;
    var _filters = request.filters;
    var _settings = request.settings;
    var _countOnly = request.countOnly;
    var _maxResults = request.maxResults;
    var _isDebug = request.isDebug;

    var columns = _columns.map((col) => search.createColumn(col));

    // Created Search object
    var searchObj = search.create({
      type: _type,
      filters: _filters,
      columns: columns,
      settings: _settings,
    });

    // Run the search and get paged data
    var paged = searchObj.runPaged({
      pageSize: Math.min(defaultPageSize, _maxResults),
    });
    debug.push("runPaged complete");
    response.data.count = paged.count;

    // If count only is enabled, we dont need to look for results
    if (_countOnly !== true) {
      var resultsData = [];
      var resultCount = 0;
      debug.push("pageRanges length: " + paged.pageRanges.length);

      // Loop on pageRanges
      for (var pl = 0; pl < paged.pageRanges.length; pl++) {
        var currentPage = paged.fetch({ index: paged.pageRanges[pl].index });

        debug.push(
          `pageRanges index: ${pl}. currentPage length: ${currentPage.data.length}`
        );

        // Loop on currentPage data
        for (var cp = 0; cp < currentPage.data.length; cp++) {
          debug.push(`currentPage index: ${cp}`);
          var result = currentPage.data[cp];
          const resultMod = _columns.map((col) =>
            col.txt === true ? result.getText(col) : result.getValue(col)
          );
          resultsData.push(resultMod);
          resultCount++;

          // If maxResults is reached, skip next data loops
          if (resultCount === _maxResults) break;
        }

        // If maxResults is reached, skip next pagerange loops
        if (resultCount === _maxResults) break;
      }

      response.data.items = resultsData;
      debug.push(`Total result count: ${resultCount}`);
    }
    if (_isDebug === true) response.debug = debug;

    return response;
  } catch (e) {
    log.error({ title: "error", details: e });
    response.success = false;
    response.error = { name: e.name, message: e.message, stack: e.stack };
  }
  return response;
}
