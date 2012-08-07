/*
 * Mark and share text 
 * 
 * by SmartTeleMax team
 * Released under the MIT License
 *
 *= require ./ierange
 */


(function(){

var MaSha = function(options) {
    options = options || {};

    if ('is_block' in options){ options.isBlock = options.is_block}

    this.options = extend({}, MaSha.defaultOptions, options);
};

MaSha.version = "22.05.2012-12:08:33"; // filled automatically by hook

MaSha.defaultOptions = {
    'regexp': "[^\\s,;:\u2013.!?<>\u2026\\n\u00a0\\*]+",
    'selectable': 'selectable-content',
    'ignored': null,
    'validate': false,
    'isBlock': function(el){
      return el.nodeName == 'BR' || inArray(getCompiledStyle(el, 'display'),
                                               ['inline', 'none']) == -1;
    }
};

MaSha.prototype = {
    init: function(options, data){ // domready
        options = options || {};
        if ('is_block' in options){ options.isBlock = options.is_block}
        this.options = extend({}, this.options, options);

        this.counter = 0;
        this.savedSel = [];
        this.ranges = {};
        this.childs = [];
        this.blocks = {};
        MaSha.captureCount = 0;


        this.data = data;

        this.selectable = (typeof this.options.selectable == 'string'?
                             document.getElementById(this.options.selectable):
                             this.options.selectable);

        if (typeof this.options.regexp != 'string'){
            throw 'regexp is set as string';
        }
        this.regexp = new RegExp(this.options.regexp, 'ig');

        var this_ = this;

        if (!this.selectable) {
            throw new Error("Page doesn't have any selectable content!");
        }

        this.isIgnored = this.constructIgnored(this.options.ignored);
    
        //cleanWhitespace(this.selectable);
    
        // enumerate block elements containing a text
        this.enumerateElements();

        this.layout();
    },

    /*
     * Reads initial selections from data and adds the decorations
     */
    layout: function(){
        if (!this.data){ return; }

        for (var i=0; i < this.data.length; i++) {
            this.deserializeSelection(this.data[i]);
        }
    },

    /*
    * Retrieves the selected text, after normalization
    *
     */
    getSelection: function(){
        var regexp = new RegExp(this.options.regexp, 'g');
        var text = window.getSelection().toString();

        if (text == '' || !regexp.test(text)) return;

        this.currentRange = this.getFirstRange();
        this.currentRange = this.normalizeRange(this.currentRange);

        if (!this.rangeIsSelectable()){
            return;
        }

        var selectedText = this.currentRange.getSelectedText();
        var selectedLocation = this.serializeRange(this.currentRange);

        if (!selectedText || !selectedLocation) return;

        return {text: selectedText, location: selectedLocation};
    },

    /*
    * Adds new selection and decorates the text
    *
     */
    addSelection: function(range) {
        if (typeof range == "string"){
            range = this.deserializeRange(range);
        }

        // not actually needed, add selection is always called with a range
        // range = range || this.currentRange;

        range = this.normalizeRange(range);

        var class_name = 'num'+this.counter;

        // generating hash part for this range
        this.ranges[class_name] = this.serializeRange(range);

        range.wrapSelection(class_name+' user_selection_true');

        this.counter++;
        window.getSelection().removeAllRanges();
        this.currentRange = null;

        return this.addAnchorForSelection(class_name);
    },

    /*
    * Adds event handling for the anchor added along with the selection, and returns the anchor dom element
    *
     */
    addAnchorForSelection: function(class_name) {
        var this_ = this;

        var anchor_span = document.createElement('span');
        anchor_span.className = 'anchor';

        var wrappers = byClassName(this.selectable, class_name);
        wrappers[wrappers.length-1].appendChild(anchor_span);

        return anchor_span;
    },

    /*
    * Highlights the specified selection by adding a class to the DOM elements
    *
     */
    highlightSelection: function(class_name){
        var wrappers = byClassName(this.selectable, class_name);
        for (var i=wrappers.length;i--;){
            addClass(wrappers[i], 'highlight');
        }
    },

    /*
     * Unhighlights the selection by removing the class
     *
     */
    unhighlightSelection: function(class_name){
        var wrappers = byClassName(this.selectable, class_name);
        for (var i=wrappers.length;i--;){
            removeClass(wrappers[i], 'highlight');
        }
    },


    /*
     * Normalizez a given range: for example if the selection didn't catch full words, is going to ensure the selected range has full words.
     *
     */
    normalizeRange: function(range){
        range = this.checkSelection(range);

        // Removing merging selections for now
        //range = this.mergeSelections(range);

        return range;
    },
    /*
     * Interface functions, safe to redefine
     */
    getPositionChecksum: function(wordsIterator){
        /*
         * Used in validation. This method accepts word sequence iterator (a function returning 
         * the next word of sequence on each call or null if words are) and returns a string checksum. 
         * The getPositionChecksum method is called twice for each range: one for start position and 
         * one for end position (with reversed iterator).
         * 
         * The checksum is included into hash and it is checked on page load. If calculated checksum 
         * doesn't one from url, the selection is not restored.
         */
        var sum = '';
        for (var i=0; i<3;i++){
            var part = (wordsIterator() || '').charAt(0);
            if (part){
                var allowedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
                var integer = part.charCodeAt(0) % allowedChars.length;
                part = allowedChars.charAt(integer);
            }
            sum += part;
        }
        return sum;
    },

    // XXX sort methods logically
    deleteSelections: function(numclasses){
        for(var i=numclasses.length; i--;){
            var numclass = numclasses[i];
            var spans = byClassName(this.selectable, numclass);
            if (spans.length < 1) {
                console.warn("Couldn't delete selection for " + numclass);
                return;
            }

            var anchor = lastWithClass(spans[spans.length-1], 'anchor');
            if (anchor === undefined || anchor === null ){
                console.warn("Couldn't delete selection for " + numclass);
                return;
            }
            anchor.parentNode.removeChild(anchor);

            this.removeTextSelection(spans);
            delete this.ranges[numclass];
        }
    },

    removeTextSelection: function(spans){
        for (var i=spans.length; i--;){
            var span = spans[i];
            var childrenNumber = span.childNodes.length;
            for (var j=0; j<childrenNumber;j++){
                // this function call actually removes the child, so the index that we are removing is always 0.
                span.parentNode.insertBefore(span.childNodes[0], span);
            }
            span.parentNode.removeChild(span);
        }
    },

    isInternal: function(node){
        while (node.parentNode){
            if (node.parentNode == this.selectable){
                return true;
            }
            node = node.parentNode;
        }
        return false;
    },

    _siblingNode: function(cont, prevnext, firstlast, offs, regexp){
        regexp = regexp || this.regexp;
        while (cont.parentNode && this.isInternal(cont)){
            while (cont[prevnext + 'Sibling']){
                cont = cont[prevnext + 'Sibling'];

                // ignore anchors from counting
                if (! hasClass(cont, 'anchor')) {
                    while (cont.nodeType == 1 && cont.childNodes.length){
                        cont = cont[firstlast + 'Child'];
                    }
                    if(cont.nodeType == 3 &&
                       (cont.data.match(regexp) != null)){
                        return {_container: cont, _offset: offs * cont.data.length};
                    }
                }
            }
            cont = cont.parentNode;
        }
        return null;
    },

    prevNode: function(cont, regexp){
        return this._siblingNode(cont, 'previous', 'last', 1, regexp);
    },
    nextNode: function (cont, regexp){
        return this._siblingNode(cont, 'next', 'first', 0, regexp);
    },

    wordCount: function wordCount(node) {
        var _wcount = 0;

        // Ignoring text inside anchors from word count
        if (parentWithClass(node, 'anchor')){
            return 0;
        }

        if (node.nodeType == 3) {
            // counting words in text node
            var match = node.nodeValue.match(this.regexp);
            if (match) { _wcount += match.length; }
        } else if (node.childNodes && node.childNodes.length){ // Child element
            // counting words in element node with nested text nodes
            var alltxtNodes = textNodes(node);
            for (i=alltxtNodes.length; i--;) {
                _wcount += alltxtNodes[i].nodeValue.match(this.regexp).length;
            }
        }
        return _wcount;
    },

    words: function(container, offset, pos){
        // counting words in container from/untill offset position
    
        if (container.nodeType == 1) {
            container = firstTextNode(container);
        }

        //get content part, that isn't included in selection, 
        //split it with regexp and count words in it
        var wcount = container.data.substring(0, offset).match(this.regexp);
        
        if (wcount != null) { 
            if (pos=='start') wcount = wcount.length+1; 
            if (pos=='end') wcount = wcount.length;
        } else { 
            wcount = 1;
        }

        var node = container;
        var selectionIndex = this.getNum(container);
        var firstNode = this.getFirstTextNode(selectionIndex);

        while(node && node != firstNode){
            node = this.prevNode(node, /.*/)._container;
            wcount += this.wordCount(node);
            //node = node? node.container: null;
        }

        /*
        n = container.previousSibling;
        // FIXME! Required word count outside of inner <b></b>
        while (n) {
            var onei = wordCount(n);
            wcount += onei;
            n = n.previousSibling;
        }
        */
        return selectionIndex + ':' + wcount;
    },

    symbols: function(_node){
        var _count = 0;
        if (_node.nodeType == 3) {
            _count = _node.nodeValue.length;
        } else if (_node.childNodes && _node.childNodes.length) {
            var allnodes = textNodes(_node);
            for (var i = allnodes.length; i--; ) {
                _count += allnodes[i].nodeValue.length;
            }
        }
        return _count;
    },

    deserializeSelection: function(serialized) {
        var sel = window.getSelection();
        if(sel.rangeCount > 0){ sel.removeAllRanges(); }

        var range = this.deserializeRange(serialized);
        if(range){
            this.addSelection(range);
        }
    },

    deserializeRange: function(serialized){
        var result = /^([0-9A-Za-z:]+)(?:,|%2C)([0-9A-Za-z:]+)$/.exec(serialized);
        var bits1 = result[1].split(":");
        var bits2 = result[2].split(":");
        // XXX this if is ugly
        if(parseInt(bits1[0], 10) < parseInt(bits2[0], 10) ||
           (bits1[0] == bits2[0] && parseInt(bits1[1], 10) <= parseInt(bits2[1], 10))){

            var start = this.deserializePosition(bits1, 'start'),
                end = this.deserializePosition(bits2, 'end');

            if (start.node && end.node){
                var range = document.createRange();
                range.setStart(start.node, start.offset);
                range.setEnd(end.node, end.offset);
                if(!this.options.validate || this.validateRange(range, bits1[2], bits2[2])){
                    return range;
                }
            }
        }

        if (window.console && (typeof window.console.warn == 'function')){
            window.console.warn('Cannot deserialize range: ' + serialized);
        }
        return null;
    }, 

    validateRange: function(range, sum1, sum2){
        var valid = true, sum;
        if (sum1){
            sum = this.getPositionChecksum(range.getWordIterator(this.regexp));
            valid = valid && sum1 == sum;
        }
        if (sum2){
            sum = this.getPositionChecksum(range.getWordIterator(this.regexp, true));
            valid = valid && sum2 == sum;
        }
        return valid;
    },

    getRangeChecksum: function(range){
        sum1 = this.getPositionChecksum(range.getWordIterator(this.regexp));
        sum2 = this.getPositionChecksum(range.getWordIterator(this.regexp, true));
        return [sum1, sum2];
    },

    deserializePosition: function(bits, pos){
         // deserializes №OfBlock:№OfWord pair
         // getting block
         var node = this.blocks[parseInt(bits[0], 10)];

         var pos_text;
         var offset, stepCount = 0, exit = false;
         // getting word in all text nodes
         while (node) {
             var re = new RegExp(this.options.regexp, 'ig');
             while ((myArray = re.exec(node.data )) != null) {
                 stepCount++;
                 if (stepCount == bits[1]) {
                     if (pos=='start') offset = myArray.index;
                     if (pos=='end') offset = re.lastIndex;

                     return {node: node, offset: parseInt(offset, 10)};
                 }

             }
             // word not found yet, trying next container
             node = this.nextNode(node, /.*/);
             node = node? node._container: null;

             if (node && this.isFirstTextNode(node)){
                 node = null;
             }

         }
         return {node: null, offset: 0};
    },

    serializeRange: function(range) {
        var start = this.words(range.startContainer, range.startOffset, 'start');
        var end = this.words(range.endContainer, range.endOffset, 'end');
        if(this.options.validate){
            var sums = this.getRangeChecksum(range);
            start += ':' + sums[0];
            end += ':' + sums[1];
        }
        return start + "," + end;
    },

    checkSelection: function(range) {
        /*
         * Corrects selection.
         * Returns range object
         */
        this.checkPosition(range, range.startOffset, range.startContainer, 'start');
        this.checkPosition(range, range.endOffset, range.endContainer, 'end');

        this.checkBrackets(range);
        this.checkSentence(range);

        return range;
    },

    checkPosition: function(range, offset, container, position) {
        var this_ = this, newdata;

        function isWord(str){
            return str.match(this_.regexp) != null;
        }

        function isNotWord(str){
            return str.match(this_.regexp) == null;
        }

        function stepBack(container, offset, condition) {
            // correcting selection stepping back and including symbols
            // that match a given condition
            var init_offset = offset;
            while (offset > 0 && condition(container.data.charAt(offset-1))){
                offset--;
            }
            return offset;
        }
        
        function stepForward(container, offset, condition) {
            // correcting selection stepping forward and including symbols
            // that match a given condition
            var init_offset = offset;
            while (offset < container.data.length && condition(container.data.charAt(offset))){
                offset++;
            }
            return offset;
        }
        if (container.nodeType == 1 && offset > 0){
            // Triple click handling for elements like <br>
            if(offset < container.childNodes.length){
                container = container.childNodes[offset];
                offset = 0;
            } else {
                // XXX what is the case for this code?
                var containerTextNodes = textNodes(container); // XXX lastTextNode
                if (containerTextNodes.length){ // this if fixes regressionSelectionStartsAtImage test
                    container = containerTextNodes[containerTextNodes.length-1];
                    offset = container.data.length;
                }
            }
        }

        if (position == 'start') {
            
            if (container.nodeType == 1 && trim(textContent(container)) != '') {
                container = firstTextNode(container);
                offset = 0;
            }

            if (container.nodeType != 3 ||
                container.data.substring(offset).match(this.regexp) == null) {
                newdata = this.nextNode(container);
                container = newdata._container;
                offset = newdata._offset;
            }

            // if container is actually an anchor, ignore it and set the container to the next node
            while (parentWithClass(container, 'anchor')){
                newdata = this.nextNode(container, /.*/);
                container = newdata._container;
                offset = 0;
            }

            // Important! Shorten the selection first and then extend it!
            offset = stepForward(container, offset, isNotWord);
            offset = stepBack(container, offset, isWord);
            
            range.setStart(container, offset);
        }
        
        if (position == 'end') {
            if (container.nodeType == 1 && trim(textContent(container)) != '' && offset != 0) {
                container = container.childNodes[range.endOffset-1];

                var containerTextNodes = textNodes(container); // XXX lastTextNode
                container = containerTextNodes[containerTextNodes.length-1];

                offset = container.data.length;
            }

            if (container.nodeType != 3 ||
                container.data.substring(0, offset).match(this.regexp) == null) {
                newdata = this.prevNode(container);
                container = newdata._container;
                offset = newdata._offset;
            }

            // if container is actually an anchor, ignore it and set the container to the prev node
            while (parentWithClass(container, 'anchor')){
                newdata = this.prevNode(container, /.*/);
                container = newdata._container;
                offset = container.data.length;
            }

            // Important! Shorten the selection first and then extend it!
            offset = stepBack(container, offset, isNotWord);
            offset = stepForward(container, offset, isWord);

            range.setEnd(container, offset);
        }
    },

    checkBrackets: function(range){
        this._checkBrackets(range, '(', ')', /\(|\)/g, /\(x*\)/g);
        this._checkBrackets(range, "\u00ab", "\u00bb", /\\u00ab|\\u00bb/g, /\u00abx*\u00bb/g);
        // XXX Double brackets?
    },
    _checkBrackets: function(range, ob, cb, match_reg, repl_reg){
        // XXX Needs cleanup!
        var text = range.toString();//getTextNodes(range).map(function(x){return x.data;}).join('');
        var brackets = text.match(match_reg);
        var new_data;
        if (brackets){
            brackets = brackets.join('');
            var l = brackets.length +1;
            while(brackets.length < l){
                l = brackets.length;
                brackets = brackets.replace(repl_reg, 'x');
            }
            if (brackets.charAt(brackets.length-1) == cb &&
                    text.charAt(text.length-1) == cb){
                if(range.endOffset == 1) {
                    new_data = this.prevNode(range.endContainer);
                    range.setEnd(new_data.container, new_data.offset);
                } else {
                    range.setEnd(range.endContainer, range.endOffset-1);
                }
            }
            if (brackets.charAt(0) == ob &&
                    text.charAt(0) == ob){
                if(range.startOffset == range.startContainer.data.length) {
                    new_data = this.nextNode(range.endContainer);
                    range.setStart(new_data.container, new_data.offset);
                } else {
                    range.setStart(range.startContainer, range.startOffset+1);
                }
            }
        }

    },

    checkSentence: function(range){
        var data, nextAfterRange;
        if(range.endOffset == range.endContainer.data.length) {
            data = this.nextNode(range.endContainer, /.*/);
            if(!data) {return null;}
            nextAfterRange = data._container.data.charAt(0);
        } else {
            data = {_container: range.endContainer, _offset: range.endOffset};
            nextAfterRange = range.endContainer.data.charAt(range.endOffset);
        }

        if (nextAfterRange.match(/\.|\?|\!/)){
            // sentence end detected
            // XXX rewrite
            var text = range.toString();
            // XXX support not only latin and russian?
            if (text.match(/(\.|\?|\!)\s+[A-Z\u0410-\u042f\u0401]/)){
                return apply();
            }

            if (range.startOffset == 0 &&
                range.startContainer.previousSibling &&
                range.startContainer.previousSibling.nodeType == 1 &&
                range.startContainer.previousSibling.className == 'selection_index'){
                return apply();
            }

            var node, iterator = range.getElementIterator();
            while ((node=iterator())) {
                if (node.nodeType == 1 && node.className == 'selection_index'){
                    return apply();
                }
            }

            if (text.charAt(0).match(/[A-Z\u0410-\u042f\u0401]/)){
                var pre = range.startContainer.data.substring(0, range.startOffset);
                if(!pre.match(/\S/)) {
                    var pre_data = this.prevNode(range.startContainer, /\W*/);
                    pre = pre_data._container.data;
                }
                pre = trim(pre);
                if (pre.charAt(pre.length-1).match(/(\.|\?|\!)/)){
                    return apply();
                }
            }
            return null;
        }
        
        function apply(){
            range.setEnd(data._container, data._offset+1);
        }
    },

    mergeSelections: function(range){
        var merges = [];
        var iterator = range.getElementIterator();
        var node = iterator();
        var last = node;
        var parent_ = parentWithClass(node, 'user_selection_true');
        if (parent_){
            parent_ = /(num\d+)(?:$| )/.exec(parent_.className)[1];
            range.setStart(firstTextNode(firstWithClass(this.selectable, parent_)), 0);
            merges.push(parent_);
        }
        while (node){
            if (node.nodeType == 1 && hasClass(node, 'user_selection_true')){
               var cls = /(num\d+)(?:$|)/.exec(node.className)[0];
               if (inArray(cls, merges) == -1){
                   merges.push(cls);
               }
            }
            last = node;
            node = iterator();
        }
        last = parentWithClass(last, 'user_selection_true');
        if (last){
            last = /(num\d+)(?:$| )/.exec(last.className)[1];
            var tnodes = textNodes(lastWithClass(this.selectable, last)); // XXX lastTextNode
            var lastNode = tnodes[tnodes.length-1];
            range.setEnd(lastNode, lastNode.length);
        }
        if (merges.length){
            // this breaks selection, so we need to dump a range and restore it after DOM changes
            var sc = range.startContainer, so=range.startOffset,
                ec = range.endContainer, eo = range.endOffset;
            this.deleteSelections(merges);
            range.setStart(sc, so);
            range.setEnd(ec, eo);
        }
        return range;
    },

    getFirstRange: function(){
        var sel = window.getSelection();
        var res = sel.rangeCount ? sel.getRangeAt(0) : null;
        return res;
    },
    enumerateElements: function(){
        // marks first text node in each visual block element:
        // inserts a span with special class and ID before it
        var node = this.selectable;
        MaSha.captureCount = MaSha.captureCount || 0;
        var this_ = this;

        enumerate(node);

        function enumerate(node){
            var children = node.childNodes;
            var hasBlocks = false;
            var blockStarted = false;
            
            var len;
            for (var idx=0; idx<children.length; ++idx) {
                var child = children.item(idx);
                var nodeType = child.nodeType;
                if (nodeType==3 && !child.nodeValue.match(this_.regexp)) {
                    // ..if it is a textnode that is logically empty, ignore it
                    continue;
                } else if (nodeType==3) {
                    if (!blockStarted){
                        // remember the block
                        MaSha.captureCount++;
                        var index_span = document.createElement('span');
                        // XXX prefix all class and id attributes with "masha"
                        index_span.id = 'selection_index' + MaSha.captureCount;
                        index_span.className = 'selection_index';
                        child.parentNode.insertBefore(index_span, child);

                        idx++;
                        this_.blocks[MaSha.captureCount] = child;
                        hasBlocks = blockStarted = true;
                    }
                } else if (nodeType==1) {
                    // XXX check if this is correct
                    if (!this_.isIgnored(child)){
                        var isBlock = this_.options.isBlock(child);
		      
                        if (isBlock){
                            var childHasBlocks = enumerate(child);
                            hasBlocks = hasBlocks || childHasBlocks;
                            blockStarted = false;
                        } else if (!blockStarted) {
                            blockStarted = enumerate(child);
                            hasBlocks = hasBlocks || blockStarted;
                        }
                    }
                }
            }
            return hasBlocks;
        }
    },
    isFirstTextNode: function(node){
        if (!node) {return false;}

        // Get the selection index
        var num = this.getNum(node);

        // check whether the node is the first text node
        return this.getFirstTextNode(num) == node;
    },

    getFirstTextNode: function(numclass){
        if(!numclass) { return null; }

        // Get the selection index div
        var tnode = document.getElementById('selection_index'+numclass);

        // Return the first element after the selection index div
        return this.nextNode(tnode, /.*/)._container;
    },
    getNum: function(cont){
        while (cont.parentNode){
            while (cont.previousSibling){
                cont = cont.previousSibling;
                while (cont.nodeType == 1 && cont.childNodes.length){
                    cont = cont.lastChild;
                }
                if (cont.nodeType == 1 && cont.className == 'selection_index'){
                    return cont.id.replace('selection_index', '');
                }
            }
            cont = cont.parentNode;
        }
        return null;
    },

    constructIgnored: function(selector){
        if (typeof selector == 'function'){
            return selector;
        } else if (typeof selector == 'string'){
            // supports simple selectors by class, by tag and by id
            var by_id = [], by_class = [], by_tag = [];
            var selectors = selector.split(',');
            for (var i=0; i<selectors.length; i++) {
              var sel = trim(selectors[i]);
              if (sel.charAt(0) == '#') { 
                by_id.push(sel.substr(1));
              } else if (sel.charAt(0) == '.') { 
                by_class.push(sel.substr(1)); 
              } else {
                by_tag.push(sel);
              }
            }

            return function(node){
                var i;
                for (i = by_id.length; i--;){
                    if (node.id == by_id[i]) { return true; }
                }
                for (i = by_class.length; i--;){
                    if (hasClass(node, by_class[i])) { return true; }
                }
                for (i = by_tag.length; i--;){
                    if (node.tagName == by_tag[i].toUpperCase()) { return true; }
                }
                return false;
            };
        } else {
            return function(){ return false; };
        }
    },

    rangeIsSelectable: function(){
        var node, firstNode, lastNode, first=true;
        var range = this.currentRange;
        if (!range) { return false; }
        var iterator = range.getElementIterator();
        while ((node = iterator())){
            if (node.nodeType == 3 && node.data.match(this.regexp) != null){
                // first and last TEXT nodes
                firstNode = firstNode || node;
                lastNode = node;
            }
            // We need to check first element. Text nodes are not checked, so we replace
            // it for it's parent.
            node = (first && node.nodeType == 3)? node.parentNode : node;
            first = false;
            
            if (node.nodeType == 1){
                // Checking element nodes. Check if the element node and all it's parents
                // till selectable are not ignored
                var iter_node = node;
                while (iter_node != this.selectable && iter_node.parentNode){
                    if (this.isIgnored(iter_node)){
                        return false;
                    }
                    iter_node = iter_node.parentNode;
                }
                if (iter_node != this.selectable){ return false; }
            }
        }

        /**
         * Make range not selectable if within another range
         *
         */
        /*
        var first_selection = parentWithClass(firstNode, 'user_selection_true');
        var last_selection = parentWithClass(lastNode, 'user_selection_true');
        if (first_selection && last_selection){
            var reg = /(?:^| )(num\d+)(?:$| )/;
            return (reg.exec(first_selection.className)[1] != 
                    reg.exec(last_selection.className)[1]);
        }
        */

        return true;
    }

};

/*
 * Range object
 */

// support browsers and IE, using ierange with Range exposed
// XXX why this doesn't work without Range exposed
var Range = window.Range || document.createRange().constructor;

Range.prototype.splitBoundaries = function() {
    var sc = this.startContainer,
        so = this.startOffset,
        ec = this.endContainer,
        eo = this.endOffset;
    var startEndSame = (sc === ec);

    if (ec.nodeType == 3 && eo < ec.length) {
        ec.splitText(eo);
    }

    if (sc.nodeType == 3 && so > 0) {
        sc = sc.splitText(so);
        if (startEndSame) {
            eo -= so;
            ec = sc;
        }
        so = 0;
    }
    this.setStart(sc, so);
    this.setEnd(ec, eo);
};

Range.prototype.getTextNodes = function() {
    var iterator = this.getElementIterator();
    var textNodes = [], node;
    while ((node = iterator())){
        // XXX was there a reason to check for empty string?
        // with this check selecting two sibling words separately
        // and then selecting them both in one range doesn't work properly

        // Preventing text inside anchors from being selected
        if (! parentWithClass(node, 'anchor')){
            if (node.nodeType == 3){// && !node.data.match(/^\s*$/)){
                textNodes.push(node);
            }
        }
    }
    return textNodes;
};

function elementIterator(parent, cont, end, reversed){
    reversed = !!reversed;
    cont = cont || parent[reversed? 'lastChild' : 'firstChild'];
    var finished = !cont;
    var up = false;
    
    function next(){
        if (finished) {return null;} 
        var result = cont;
        if (cont.childNodes && cont.childNodes.length && !up){
            cont = cont[reversed? 'lastChild' : 'firstChild'];
        } else if (cont[reversed? 'previousSibling' : 'nextSibling']){
            cont = cont[reversed? 'previousSibling' : 'nextSibling'];
            up = false;
        } else if (cont.parentNode){
            cont = cont.parentNode;
            if (cont === parent){ finished = true; }
            up = true;
            next();
        }
        if (result === end) { finished = true; }
        return result;
    }
    return next;
}

Range.prototype.getElementIterator = function(reversed){
    if (reversed) {
        return elementIterator(null, this.endContainer, this.startContainer, true);
    } else {
        return elementIterator(null, this.startContainer, this.endContainer);
    }
};
Range.prototype.getWordIterator = function(regexp, reversed){
    var elem_iter = this.getElementIterator(reversed);
    var node;
    var counter_aim = 0, i = 0;
    var finished = false, match, this_ = this;
    function next(){
        if(counter_aim == i && !finished){
            do{
                do{
                    node = elem_iter();
                } while(node && node.nodeType != 3)
                finished = !node;
                if (!finished){
                    value = node.nodeValue;
                    if (node == this_.endContainer){
                        value = value.substr(0, this_.endOffset);
                    }
                    if (node == this_.startContainer){
                        value = value.substr(this_.startOffset);
                    }
                    match = value.match(regexp);
                }
            } while (node && !match);
            if (match){
                counter_aim = reversed? 0: match.length - 1;
                i = reversed? match.length - 1: 0;
            }
        } else {
            if (reversed) {i--;} else {i++;}
        }
        if (finished) { return null; }
        return match[i];
    }
    return next;
};

Range.prototype.wrapSelection = function(className){
    this.splitBoundaries();
    var textNodes = this.getTextNodes();
    for (var i=textNodes.length; i--;){
        // XXX wrap sibling text nodes together
        var span = document.createElement('span');
        span.className = className;
        textNodes[i].parentNode.insertBefore(span, textNodes[i]);
        span.appendChild(textNodes[i]);
    }
};

// Returns to reflect the actual text selection, excluding the ignored elements
Range.prototype.getSelectedText = function(){
    this.splitBoundaries();
    var textNodes = this.getTextNodes();
    var text = textNodes.map(function(x){return x.data;}).join('');

    if (! text) return;
    if (text.length < 1) return;

    return text;
};

/*
 * Exposing
 */

window.MaSha = MaSha;

if (window.jQuery){
    window.jQuery.fn.masha = function(data, options) {
        options = options || {};
        options = extend({'selectable': this[0]}, options);
        return new MaSha(data, options);
    };
}


/*
 * Shortcuts
 */

function extend(obj){
    for(var i=1; i<arguments.length; i++){
        for (key in arguments[i]){
            obj[key] = arguments[i][key];
        }
    }
    return obj;
}

function trim(text) {
    return (text || "").replace(/^\s+|\s+$/g, "");
}

function getCompiledStyle(elem, strCssRule){
    // copypasted from Internets
    var strValue = "";
    if(document.defaultView && document.defaultView.getComputedStyle){
        strValue = document.defaultView.getComputedStyle(elem, "").getPropertyValue(strCssRule);
    }
    else if(elem.currentStyle){
        strCssRule = strCssRule.replace(/\-(\w)/g, function (strMatch, p1){
            return p1.toUpperCase();
        });
        strValue = elem.currentStyle[strCssRule];
    }
    return strValue;
}

function textContent(elem){
    return elem.textContent || elem.innerText;
}

function parentWithClass(p, cls){
    while (p && !hasClass(p, cls)){p = p.parentNode;}
    return p || null;
}
function firstWithClass(elem, cls){
    var iter = elementIterator(elem);
    var node = null;
    while ((node = iter())){
        if (node.nodeType === 1 && hasClass(node, cls)) {return node;}
    }
    return null;
}
function lastWithClass(elem, cls){
    var elems = byClassName(elem, cls);
    if (elems){
        return elems[elems.length-1];
    }
    return null;
}
function firstTextNode(elem){
    var iter = elementIterator(elem);
    var node = null;
    while ((node = iter())){
        if (node.nodeType === 3) {return node;}
    }
    return node;
}
function byClassName(elem, cls){
    if (elem.getElementsByClassName){
        return elem.getElementsByClassName(cls);
    } else {
        var ret = [], node;
        var iter = elementIterator(elem);
        while ((node = iter())){
            if (node.nodeType == 1 && hasClass(node, cls)) {
                ret.push(node);
            }
        }
        return ret;
    }
}
function textNodes(elem) {
    var ret = [], node;
    var iter = elementIterator(elem);
    while ((node = iter())){
        if (node.nodeType === 3) {
            ret.push(node);
        }
    }
    return ret;
}

function _classRegExp(cls){
    return new RegExp('(^|\\s+)'+cls+'(?:$|\\s+)', 'g');
}
function hasClass(elem, cls){
    var reg = _classRegExp(cls);
    return reg.test(elem.className);
}
function addClass(elem, cls){
    // XXX attention! NOT UNIVERSAL!
    // don't use for classes with non-literal symbols
    var reg = _classRegExp(cls);
    if (!reg.test(elem.className)){
        elem.className = elem.className + ' ' + cls;
    }
}
function removeClass(elem, cls){
    // XXX attention! NOT UNIVERSAL!
    // don't use for classes with non-literal symbols
    var reg = _classRegExp(cls);
    if (reg.test(elem.className)){
        elem.className = trim(elem.className.replace(reg, '$1'));
    }
}

function inArray(elem, array) {
    // from jQuery
    // Hate IE
    for (var i = 0, length=array.length; i < length; i++){
        if (array[i] === elem){ return i; }
    }
    return -1;
}

function addEvent(elem, type, fn){
    if (elem.addEventListener) {
        elem.addEventListener(type, fn, false);
    } else if (elem.attachEvent) {
        elem.attachEvent("on" + type, fn);
    }    
}
function preventDefault(e){
    if (e.preventDefault) { e.preventDefault(); }
    else { e.returnValue = false; }
}
function stopEvent(e){
    if (e.stopPropagation) { e.stopPropagation(); } 
    else { e.cancelBubble = true; } 
}
function getPageXY(e){
    // from jQuery
    // Calculate pageX/Y if missing
    if (e.pageX == null) {
        var doc = document.documentElement, body = document.body;
        var x = e.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc.clientLeft || 0);
        var y = e.clientY + (doc && doc.scrollTop || body && body.scrollTop || 0) - (doc.clientTop || 0);
        return {x: x, y: y};
    }
    return {x: e.pageX, y: e.pageY};
}

})();