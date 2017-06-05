/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 University of California San Diego
 * Author: Jim Robinson
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * Created by jrobinson on 4/15/16.
 */

var igv = (function (igv) {

    var vGap = 2;
    var DEFAULT_VISIBILITY_WINDOW = 1000000000000000000;

    igv.VariantTrack = function (config) {


        this.visibilityWindow = config.visibilityWindow === undefined ? 'compute' : config.visibilityWindow;

        igv.configTrack(this, config);

        this.displayMode = config.displayMode || "COLLAPSED";    // COLLAPSED | EXPANDED | SQUISHED
        this.labelDisplayMode = config.labelDisplayMode;
        this.variantHeight = config.variantHeight || 10;
        this.squishedCallHeight = this.displayWG ? (config.squishedCallHeight || 2) : (config.squishedCallHeight || 1);    //Prefer user defined args until not specified. Use 2 for constructing Whole genome by default
        this.expandedCallHeight = this.displayWG ? (config.expandedCallHeight || 12) : (config.squishedCallHeight || 10);  //Prefer user defined args until not specified. Use 12 for constructing Whole genome by default
        this.featureHeight = config.featureHeight || 14;
        this.wgData = config.wgData;
        this.featureSource = new igv.FeatureSource(config);

        this.homrefColor = config.homrefColor || "rgb(200, 200, 200)"
        this.homvarColor = config.homvarColor || "rgb(17,248,254)";
        this.hetvarColor = config.hetvarColor || "rgb(34,12,253)";
        this.nRows = 1;  // Computed dynamically

    };


    igv.VariantTrack.prototype.getFileHeader = function () {
        var self = this;

        return new Promise(function (fulfill, reject) {
            if (typeof self.featureSource.getFileHeader === "function") {
                self.featureSource.getFileHeader().then(function (header) {
                    if (header) {
                        // Header (from track line).  Set properties,unless set in the config (config takes precedence)
                        if (header.name && !self.config.name) {
                            self.name = header.name;
                        }
                        if (header.color && !self.config.color) {
                            self.color = "rgb(" + header.color + ")";
                        }
                        self.callSets = header.callSets;

                        if ('compute' === self.visibilityWindow) {
                            computeVisibilityWindow.call(self);
                        }
                    }
                    fulfill(header);

                }).catch(reject);
            }
            else {
                fulfill(null);
            }
        });
    }


    function computeVisibilityWindow() {

        if (this.callSets) {
            if (this.callSets.length < 10) {
                this.visibilityWindow = DEFAULT_VISIBILITY_WINDOW;
            }
            else {
                this.visibilityWindow = 1000 + ((2500 / this.callSets.length) * 40);
            }
        }
        else {
            this.visibilityWindow = DEFAULT_VISIBILITY_WINDOW;
        }

        this.featureSource.visibilityWindow = this.visibilityWindow;


    }

    igv.VariantTrack.prototype.getFeatures = function (chr, bpStart, bpEnd) {

        var self = this;

        return new Promise(function (fulfill, reject) {

            self.featureSource.getFeatures(chr, bpStart, bpEnd).then(function (features) {
                fulfill(features);
            }).catch(reject);

        });
    }



    /**
     * The required height in pixels required for the track content.   This is not the visible track height, which
     * can be smaller (with a scrollbar) or larger.
     *
     * @param features
     * @returns {*}
     */
    igv.VariantTrack.prototype.computePixelHeight = function (features) {

        var callSets = this.callSets,
            nCalls = callSets ? callSets.length : 0,
            nRows,
            h;

        if (this.displayMode === "COLLAPSED") {
            this.nRows = 1;
            return 10 + this.variantHeight;
        }
        else {
            var maxRow = 0;
            if (features && (typeof features.forEach === "function")) {
                features.forEach(function (feature) {
                    if (feature.row && feature.row > maxRow) maxRow = feature.row;

                });
            }
            nRows = maxRow + 1;

            h = 10 + nRows * (this.variantHeight + vGap);
            this.nRows = nRows;  // Needed in draw function


            if ((nCalls * nRows * this.expandedCallHeight) > 2000) {
                this.expandedCallHeight = Math.max(1, 2000 / (nCalls * nRows));
            }


            return h + vGap + nCalls * nRows * (this.displayMode === "EXPANDED" ? this.expandedCallHeight : this.squishedCallHeight);

        }

    };


    igv.VariantTrack.prototype.draw = function (options) {
        var myself = this,
            featureList = options.features,
            ctx = options.context,
            bpPerPixel = options.bpPerPixel,
            bpStart = options.bpStart,
            pixelWidth = options.pixelWidth,
            pixelHeight = options.pixelHeight,
            bpEnd = bpStart + pixelWidth * bpPerPixel + 1,
            callHeight = ("EXPANDED" === this.displayMode ? this.expandedCallHeight : this.squishedCallHeight),
            px, px1, pw, py, h, style, i, variant, call, callSet, j, allRef, allVar, callSets,
            sampleHeight = this.displayMode === "EXPANDED" ? this.expandedCallHeight : this.squishedCallHeight,
            border = ("SQUISHED" === this.displayMode) ? 0 : 1;

        this.variantBandHeight = 10 + this.nRows * (this.variantHeight + vGap);

        callSets = this.callSets;

        igv.graphics.fillRect(ctx, 0, 0, pixelWidth, pixelHeight, {'fillStyle': "rgb(255, 255, 255)"});

        if (callSets && callSets.length > 0 && "COLLAPSED" !== this.displayMode) {
            igv.graphics.strokeLine(ctx, 0, this.variantBandHeight, pixelWidth, this.variantBandHeight, {strokeStyle: 'rgb(224,224,224) '});
        }


        if (this.wgData) {
            var input = (_.first(igv.browser.genomicStateList)).locusSearchString,
                modifiedSearchString = (igv.browser.genomicStateList[0].chromosome.name + ':' + igv.browser.genomicStateList[0].start + '-' + igv.browser.genomicStateList[0].end);  //To enable search by gene name

            if (input === 'all') {
                modifiedSearchString = input;  //Otherwise search string will be in the form of 'all:start-end'
            }

            if (modifiedSearchString === 'all') {
                var chromosomeArray = [249250621,243199373,198022430,191154276,180915260,171115067,159138663,146364022,141213431,135534747,135006516,133851895,115169878,107349540,102531392,90354753,81195210,78077248,59128983,63025520,48129895,51304566,155270560,59373566],
                    totalBP = _.reduce(chromosomeArray, function(memo, num){ return memo + num; }, 0),
                    chrLen = chromosomeArray.length,
                    arrX = [0];

                arrX.push(Math.floor(ctx.canvas.width/totalBP*chromosomeArray[0]/3));

                for (var i=1; i<chrLen+1 ; i++) {
                    arrX.push(Math.floor(ctx.canvas.width/totalBP*chromosomeArray[i]/3));
                    arrX[i] = arrX[i-1] + arrX[i];
                }

                arrX[i] = ctx.canvas.width;

                for (i = 0, len = this.wgData.length; i < len; i++) {
                var variant = this.wgData[i];
                    py = 20 ;//+ ("COLLAPSED" === this.displayMode ? 0 : variant.row * (this.variantHeight + vGap));
                    h = this.variantHeight;
                var chr = variant.referenceName;

                if (chr === 'X') {
                  chr = '23';
                }  else if ( chr === 'Y') {
                  chr = '24';
                }

                var addendum = (arrX[chr-1] == NaN ? 0 : arrX[chr-1]);
                    px = (variant.start / chromosomeArray[chr-1] * (arrX[chr] - arrX[chr-1]) + addendum);
                    px1 = (variant.end / chromosomeArray[chr-1] * (arrX[chr] - arrX[chr-1]) + addendum);
                    pw = Math.max(1, px1 - px);

                if (pw < 3) {
                    pw = 3;
                    px -= 1;
                } else if (pw > 5) {
                    px += 1;
                    pw -= 2;
                }

                ctx.fillStyle = this.color;
                ctx.fillRect(px, py, pw, h);
                }

            }
            else {
                for (i = 0, len = this.wgData.length; i < len; i++) {
                    var variant = this.wgData[i];
                    py = 20 ;//+ ("COLLAPSED" === this.displayMode ? 0 : variant.row * (this.variantHeight + vGap));
                    h = this.variantHeight;

                    var search = modifiedSearchString.substring(0, modifiedSearchString.indexOf(":")) || '';

                    if (search === '') {
                        search = modifiedSearchString;
                    }

                    if (search === 'chr' + variant.referenceName || modifiedSearchString === 'all') {
                        px = Math.floor((variant.start - bpStart) / bpPerPixel);
                        px1 = Math.floor((variant.end - bpStart) / bpPerPixel);
                        pw = Math.max(1, px1 - px);
                        if (pw < 3) {
                            pw = 3;
                            px -= 1;
                        } else if (pw > 5) {
                            px += 1;
                            pw -= 2;
                        }
                        ctx.fillStyle = this.color;
                        ctx.fillRect(px, py, pw, h);
                    }

                    if (callSets && variant.calls && "COLLAPSED" !== this.displayMode) {
                        h = callHeight;
                        for (j = 0; j < callSets.length; j++) {
                            callSet = callSets[j];
                            call = variant.calls[callSet.id];
                            if (call) {

                          // Determine genotype
                                allVar = allRef = true;  // until proven otherwise
                                call.genotype.forEach(function (g) {
                                    if (g != 0) allRef = false;
                                    if (g == 0) allVar = false;
                                });

                            if (allRef) {
                                ctx.fillStyle = this.homrefColor;
                            } else if (allVar) {
                                ctx.fillStyle = this.homvarColor;
                            } else {
                                ctx.fillStyle = this.hetvarColor;
                            }

                            py = this.variantBandHeight + vGap + (j + variant.row) * callHeight;
                            ctx.fillRect(px, py, pw, h);
                            }
                        }
                    }
                }
            }
        }

    };

    igv.VariantTrack.prototype.popupDataWithConfiguration = function (config) {
        return this.popupData(config.genomicLocation, config.x, config.y, config.viewport.genomicState.referenceFrame, config.viewport.canvas)
    };

    /**
     * Return "popup data" for feature @ genomic location.  Data is an array of key-value pairs
     */
    igv.VariantTrack.prototype.popupData = function (genomicLocation, xOffset, yOffset, referenceFrame, canvas) {

        // We use the featureCache property rather than method to avoid async load.  If the
        // feature is not already loaded this won't work,  but the user wouldn't be mousing over it either.
        if (this.wgData) {

            var chr = referenceFrame.chrName,
                tolerance = Math.floor(2 * referenceFrame.bpPerPixel),  // We need some tolerance around genomicLocation, start with +/- 2 pixels
                featureList = this.featureSource.featureCache.queryFeatures(chr, genomicLocation - tolerance, genomicLocation + tolerance),
                popupData = [],
                validatedFeatures = [],
                ctx = canvas,
                self = this;
                if (chr !== 'all')
                for(i = 0; i < this.wgData.length; i++) {
                    if ('chr' + this.wgData[i].referenceName === chr)
                        validatedFeatures.push(this.wgData[i]);
                }

            if (validatedFeatures) {

                validatedFeatures.forEach(function (variant) {

                    var row, callHeight, callSets, cs, call;

                    if ((variant.start <= genomicLocation + tolerance * 2) &&
                        (variant.end > genomicLocation - tolerance * 2)) {

                    //    if (popupData.length > 0) {
                            popupData.push('<HR>')
                      //  }

                        if ("COLLAPSED" == self.displayMode) {
                            Array.prototype.push.apply(popupData, popupDataFunction(variant));
                        }
                        else {
                            if (yOffset <= self.variantBandHeight) {
                                // Variant
                                row = (Math.floor)((yOffset - 10 ) / (self.variantHeight + vGap));
                                if (variant.row === row) {
                                    Array.prototype.push.apply(popupData, variant.popupData(genomicLocation));
                                }
                            }
                            else {
                                // Call
                                callSets = self.callSets;
                                if (callSets && variant.calls) {
                                    callHeight = self.nRows * ("SQUISHED" === self.displayMode ? self.squishedCallHeight : self.expandedCallHeight);
                                    row = Math.floor((yOffset - self.variantBandHeight - vGap) / callHeight);
                                    cs = callSets[row];
                                    call = variant.calls[cs.id];
                                    Array.prototype.push.apply(popupData, extractPopupData(call, variant));
                                }
                            }
                        }
                    }
                });
                if (chr === 'all') {
                    var chromosomeArray = [249250621,243199373,198022430,191154276,180915260,171115067,159138663,146364022,141213431,135534747,135006516,133851895,115169878,107349540,102531392,90354753,81195210,78077248,59128983,63025520,48129895,51304566,155270560,59373566],
                        totalBP = _.reduce(chromosomeArray, function(memo, num){ return memo + num; }, 0),
                        chrLen = chromosomeArray.length,
                        arrX = [0];
                        arrX.push(Math.floor(ctx.width/totalBP*chromosomeArray[0]));
                        for (var i=1; i<chrLen+1 ; i++) {
                            arrX.push(Math.floor(ctx.width/totalBP*chromosomeArray[i]));
                            arrX[i] = arrX[i-1] + arrX[i];
                        }
                        arrX[i] = ctx.width;

                        for (j = 0; j < arrX.length; j++) {
                            if (xOffset < arrX[j] ) {
                                chr = j.toString();
                                break;
                            }
                        }

                        for(i = 0; i < this.wgData.length; i++) {
                            if (this.wgData[i].referenceName === chr)
                                validatedFeatures.push(this.wgData[i]);
                        }

                        var addendum = (arrX[chr-1] === NaN ? 0 : arrX[chr-1]),
                            arrPx = [],
                            arrPx1 = [];

                        for(i = 0; i < validatedFeatures.length; i++) {
                            variant = validatedFeatures[i];
                            px = (variant.start / chromosomeArray[chr-1] * (arrX[chr] - arrX[chr-1]) + addendum);//* ctx.canvas.width / totalBP + addendum);
                            px1 = (variant.end / chromosomeArray[chr-1] * (arrX[chr] - arrX[chr-1]) + addendum);//* ctx.canvas.width / totalBP + addendum);
                            arrPx.push(px);
                            arrPx1.push(px1);
                            if ((px <= xOffset + 2) &&  //Tolerance or Sensitivity used. In the worse case, all variant belonging to a particualr chromosome will be shown when clicked.
                                (px1 > xOffset - 2)) {

                               if (popupData.length > 0) {
                                    popupData.push('<HR>')
                               }

                                if ("COLLAPSED" == self.displayMode) {
                                    Array.prototype.push.apply(popupData, popupDataFunction(variant));
                                }
                            }
                        }
                }
            }
            return popupData;
        }

        function popupDataFunction(variant) {

            var fields, gt,
                self = this;

            fields = [
                {name: "Chr", value: variant.referenceName},
                {name: "Pos", value: variant.start},
                {name: "Ref", value: variant.referenceBases},
                {name: "Alt", value: variant.alternateBases},
                {name: "Gene", value: variant.hugoGeneSymbol},
                {name: "Mutation", value: variant.proteinChange}
            ];

            if(this.calls && this.calls.length === 1) {
                gt = this.alleles[this.calls[0].genotype[0]] + this.alleles[this.calls[0].genotype[1]];
                fields.push({name: "Genotype", value: gt});
            }

            if(this.info) {
                //fields.push('<HR>');
                Object.keys(this.info).forEach(function (key) {
                    fields.push({name: key, value: self.info[key].join(', ')});
                });
            }
            return fields;
        }
    }

    /**
     * Default popup text function -- just extracts string and number properties in random order.
     * @param call
     * @param variant
     * @returns {Array}
     */
    function extractPopupData(call, variant) {

        var gt = '', popupData;
        call.genotype.forEach(function (i) {
            if (i === 0) {
                gt += variant.referenceBases;
            }
            else {
                gt += variant.alternateBases[i - 1];
            }
        })

        popupData = [];

        if (call.callSetName !== undefined) {
            popupData.push({name: 'Name', value: call.callSetName});
        }
        popupData.push({name: 'Genotype', value: gt});
        if (call.phaseset !== undefined) {
            popupData.push({name: 'Phase set', value: call.phaseset});
        }
        if (call.genotypeLikelihood !== undefined) {
            popupData.push({name: 'genotypeLikelihood', value: call.genotypeLikelihood.toString()});
        }


        Object.keys(call.info).forEach(function (key) {
            popupData.push({name: key, value: call.info[key]});
        });

        return popupData;
    }

    igv.VariantTrack.prototype.menuItemList = function (popover) {

        var self = this,
            menuItems = [],
            mapped;

        menuItems.push(igv.colorPickerMenuItem(popover, this.trackView));

        mapped = _.map(["COLLAPSED", "SQUISHED", "EXPANDED"], function(displayMode, index) {
            return {
                object: $(markupStringified(displayMode, index, self.displayMode)),
                click: function () {
                    popover.hide();
                    self.displayMode = displayMode;
                    self.trackView.update();
                }
            };
        });

        menuItems = menuItems.concat(mapped);

        function markupStringified(displayMode, index, selfDisplayMode) {

            var lut,
                chosen;

            lut =
            {
                "COLLAPSED": "Collapse",
                "SQUISHED": "Squish",
                "EXPANDED": "Expand"
            };

            chosen = (0 === index) ? '<div class="igv-track-menu-border-top">' : '<div>';
            if (displayMode === selfDisplayMode) {
                return chosen + '<i class="fa fa-check fa-check-shim"></i>' + lut[ displayMode ] + '</div>'
            } else {
                return chosen + '<i class="fa fa-check fa-check-shim fa-check-hidden"></i>' + lut[ displayMode ] + '</div>';
            }

        }

        return menuItems;

    };
/*
          igv.VariantTrack.prototype.menuItemList = function (popover) {

         var myself = this,
             menuItems = [],
             lut = {"COLLAPSED": "Collapse", "SQUISHED": "Squish", "EXPANDED": "Expand"},
             checkMark = '<i class="fa fa-check fa-check-shim"></i>',
             checkMarkNone = '<i class="fa fa-check fa-check-shim fa-check-hidden"></i>',
             trackMenuItem = '<div class=\"igv-track-menu-item\">',
             trackMenuItemFirst = '<div class=\"igv-track-menu-item igv-track-menu-border-top\">';

         menuItems.push(igv.colorPickerMenuItem(popover, this.trackView));

         ["COLLAPSED", "SQUISHED", "EXPANDED"].forEach(function (displayMode, index) {

             var chosen,
                 str;

             chosen = (0 === index) ? trackMenuItemFirst : trackMenuItem;
             str = (displayMode === myself.displayMode) ? chosen + checkMark + lut[displayMode] + '</div>' : chosen + checkMarkNone + lut[displayMode] + '</div>';

             menuItems.push({
                 object: $(str),
                 click: function () {
                     popover.hide();
                     myself.displayMode = displayMode;
                     myself.trackView.update();
                 }
             });

         });

        return menuItems;

     };
*/

    return igv;

})
(igv || {});
