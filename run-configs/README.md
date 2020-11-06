# run-configs dir

/**
   * @param {array} filters Array of object entries that specifies
   * filter parameters that will be applied in the update process.
   * 
   * If no @filters are given, the proccess will be run over
   * all assets (fetched in @step1) and over all submissions
   * (fetched in @step3) of the update process.
   * 
   * The @filters array must contain an entry for each @asset that
   * you want to include in the process.
   * 
   * The valid parameters that an object in the @filters array can 
   * have are:
   * 
   * @param {string} assetUid (mandatory). Uid of the asset. If
   * no string or an empty string is passed, this filter entry
   * will be ignored.
   * 
   * @param {array} submissionIds (optional). Array of submission _id
   * values that will be included in the update process. If this
   * parameter is given, only the values in it will be considered in
   * the update process. If this parameter is not given or is an empty 
   * array, all submissions will be fetched and considered in the update 
   * process. 
   * If both @submissionIds and @submissionIdsCsv are given, the update 
   * process will include the union of both sets of _id values.
   * 
   * @param {string} submissionIdsCsv (optional). Name of a CSV file
   * from which the set of _id values will be taken. The CSV file
   * must contains a column called 'id' from which the _id values
   * will be taken. If no absolute path is given, the file will be
   * seek in the path where this file is.
   * If both @submissionIds and @submissionIdsCsv are given, the update 
   * process will include the union of both sets of _id values.
   * 
   * Example:
   * 
   * The process will operate over the submissions in
   * submissionIds and submissionIdsCsv parameters of
   * the assetUid given in the first entry, and over
   * all submissions of the assetUid given in the second
   * entry.
   * 
   * "filters": [
   *  {
   *    assetUid: "aeUTa3g2VzbPP5SGoTx8Rp",
   *    submissionIds: [4931, 1723],
   *    submissionIdsCsv: "./2020-07-24_GEF-colectas-RG016_limpio.csv"
   *  },
   *  {
   *    assetUid: "a3SgFwv74kn7ngtVfiUoLr"
   *  }
   * ]
   * 
   */
   

