// Generated by CoffeeScript 1.9.1
(function() {
  var diff_match_patch, jsondiff,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    hasProp = {}.hasOwnProperty;

  diff_match_patch = require("diff-match-patch");

  jsondiff = (function() {
    var DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT;

    DIFF_INSERT = 1;

    DIFF_DELETE = -1;

    DIFF_EQUAL = 0;

    function jsondiff() {
      this.patch_apply_with_offsets = bind(this.patch_apply_with_offsets, this);
      this.transform_object_diff = bind(this.transform_object_diff, this);
      this.transform_list_diff_dmp = bind(this.transform_list_diff_dmp, this);
      this.transform_list_diff = bind(this.transform_list_diff, this);
      this.apply_diff = bind(this.apply_diff, this);
      this.apply_object_diff_with_offsets = bind(this.apply_object_diff_with_offsets, this);
      this.apply_object_diff = bind(this.apply_object_diff, this);
      this.apply_list_diff_dmp = bind(this.apply_list_diff_dmp, this);
      this.apply_list_diff = bind(this.apply_list_diff, this);
      this.diff = bind(this.diff, this);
      this.object_diff = bind(this.object_diff, this);
      this._text_to_array = bind(this._text_to_array, this);
      this._serialize_to_text = bind(this._serialize_to_text, this);
      this.list_diff_dmp = bind(this.list_diff_dmp, this);
      this.list_diff = bind(this.list_diff, this);
      this._common_suffix = bind(this._common_suffix, this);
      this._common_prefix = bind(this._common_prefix, this);
      this.object_equals = bind(this.object_equals, this);
      this.list_equals = bind(this.list_equals, this);
      this.equals = bind(this.equals, this);
      this.deepCopy = bind(this.deepCopy, this);
      this.typeOf = bind(this.typeOf, this);
      this.entries = bind(this.entries, this);
      this.dmp = new diff_match_patch();
    }

    jsondiff.prototype.entries = function(obj) {
      var key, n, value;
      n = 0;
      for (key in obj) {
        if (!hasProp.call(obj, key)) continue;
        value = obj[key];
        n++;
      }
      return n;
    };

    jsondiff.prototype.typeOf = function(value) {
      var s;
      s = typeof value;
      if (s === 'object') {
        if (value) {
          if (typeof value.length === 'number' && typeof value.splice === 'function' && !value.propertyIsEnumerable('length')) {
            s = 'array';
          }
        } else {
          s = 'null';
        }
      }
      return s;
    };

    jsondiff.prototype.deepCopy = function(obj) {
      return JSON.parse(JSON.stringify(obj));
    };

    jsondiff.prototype.equals = function(a, b) {
      var typea, typeb;
      typea = this.typeOf(a);
      typeb = this.typeOf(b);
      if (typea === 'boolean' && typeb === 'number') {
        return Number(a) === b;
      }
      if (typea === 'number' && typeb === 'boolean') {
        return Number(b) === a;
      }
      if (typea !== typeb) {
        return false;
      }
      if (typea === 'array') {
        return this.list_equals(a, b);
      } else if (typea === 'object') {
        return this.object_equals(a, b);
      } else {
        return a === b;
      }
    };

    jsondiff.prototype.list_equals = function(a, b) {
      var alength, i, j, ref;
      alength = a.length;
      if (alength !== b.length) {
        return false;
      }
      for (i = j = 0, ref = alength; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
        if (!this.equals(a[i], b[i])) {
          return false;
        }
      }
      return true;
    };

    jsondiff.prototype.object_equals = function(a, b) {
      var key;
      for (key in a) {
        if (!hasProp.call(a, key)) continue;
        if (!(key in b)) {
          return false;
        }
        if (!this.equals(a[key], b[key])) {
          return false;
        }
      }
      for (key in b) {
        if (!hasProp.call(b, key)) continue;
        if (!(key in a)) {
          return false;
        }
      }
      return true;
    };

    jsondiff.prototype._common_prefix = function(a, b) {
      var i, j, minlen, ref;
      minlen = Math.min(a.length, b.length);
      for (i = j = 0, ref = minlen; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
        if (!this.equals(a[i], b[i])) {
          return i;
        }
      }
      return minlen;
    };

    jsondiff.prototype._common_suffix = function(a, b) {
      var i, j, lena, lenb, minlen, ref;
      lena = a.length;
      lenb = b.length;
      minlen = Math.min(a.length, b.length);
      if (minlen === 0) {
        return 0;
      }
      for (i = j = 0, ref = minlen; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
        if (!this.equals(a[lena - i - 1], b[lenb - i - 1])) {
          return i;
        }
      }
      return minlen;
    };

    jsondiff.prototype.list_diff = function(a, b, policy) {
      var diffs, i, j, lena, lenb, maxlen, prefix_len, ref, suffix_len;
      if ((policy != null) && 'item' in policy) {
        policy = policy['item'];
      } else {
        policy = null;
      }
      diffs = {};
      lena = a.length;
      lenb = b.length;
      prefix_len = this._common_prefix(a, b);
      suffix_len = this._common_suffix(a, b);
      a = a.slice(prefix_len, lena - suffix_len);
      b = b.slice(prefix_len, lenb - suffix_len);
      lena = a.length;
      lenb = b.length;
      maxlen = Math.max(lena, lenb);
      for (i = j = 0, ref = maxlen; 0 <= ref ? j <= ref : j >= ref; i = 0 <= ref ? ++j : --j) {
        if (i < lena && i < lenb) {
          if (!this.equals(a[i], b[i])) {
            diffs[i + prefix_len] = this.diff(a[i], b[i], policy);
          }
        } else if (i < lena) {
          diffs[i + prefix_len] = {
            'o': '-'
          };
        } else if (i < lenb) {
          diffs[i + prefix_len] = {
            'o': '+',
            'v': b[i]
          };
        }
      }
      return diffs;
    };

    jsondiff.prototype.list_diff_dmp = function(a, b, policy) {
      var atext, btext, delta, diffs, lena, lenb;
      lena = a.length;
      lenb = b.length;
      atext = this._serialize_to_text(a);
      btext = this._serialize_to_text(b);
      diffs = this.dmp.diff_lineMode_(atext, btext);
      this.dmp.diff_cleanupEfficiency(diffs);
      delta = this.dmp.diff_toDelta(diffs);
      return delta;
    };

    jsondiff.prototype._serialize_to_text = function(a) {
      var i, j, len, s;
      s = '';
      for (j = 0, len = a.length; j < len; j++) {
        i = a[j];
        s += (JSON.stringify(i)) + "\n";
      }
      return s;
    };

    jsondiff.prototype._text_to_array = function(s) {
      var a, sa, x;
      a = [];
      sa = s.split("\n");
      a = (function() {
        var j, len, results;
        results = [];
        for (j = 0, len = sa.length; j < len; j++) {
          x = sa[j];
          if (x.length > 0) {
            results.push(JSON.parse(x));
          }
        }
        return results;
      })();
      return a;
    };

    jsondiff.prototype.object_diff = function(a, b, policy) {
      var diffs, key, sub_policy;
      diffs = {};
      if ((policy != null) && 'attributes' in policy) {
        policy = policy['attributes'];
      }
      if ((a == null) || (b == null)) {
        return {};
      }
      for (key in a) {
        if (!hasProp.call(a, key)) continue;
        if ((policy != null) && key in policy) {
          sub_policy = policy[key];
        } else {
          sub_policy = null;
        }
        if (key in b) {
          if (!this.equals(a[key], b[key])) {
            diffs[key] = this.diff(a[key], b[key], sub_policy);
          }
        } else {
          diffs[key] = {
            'o': '-'
          };
        }
      }
      for (key in b) {
        if (!hasProp.call(b, key)) continue;
        if (!(key in a) && (b[key] != null)) {
          diffs[key] = {
            'o': '+',
            'v': b[key]
          };
        }
      }
      return diffs;
    };

    jsondiff.prototype.diff = function(a, b, policy) {
      var diffs, otype, typea;
      if (this.equals(a, b)) {
        return {};
      }
      if ((policy != null) && 'attributes' in policy) {
        policy = policy['attributes'];
      }
      if ((policy != null) && 'otype' in policy) {
        otype = policy['otype'];
        switch (otype) {
          case 'replace':
            return {
              'o': 'r',
              'v': b
            };
          case 'list':
            return {
              'o': 'L',
              'v': this.list_diff(a, b, policy)
            };
          case 'list_dmp':
            return {
              'o': 'dL',
              'v': this.list_diff_dmp(a, b, policy)
            };
          case 'integer':
            return {
              'o': 'I',
              'v': b - a
            };
          case 'string':
            diffs = this.dmp.diff_main(a, b);
            if (diffs.length > 2) {
              this.dmp.diff_cleanupEfficiency(diffs);
            }
            if (diffs.length > 0) {
              return {
                'o': 'd',
                'v': this.dmp.diff_toDelta(diffs)
              };
            }
        }
      }
      typea = this.typeOf(a);
      if (typea !== this.typeOf(b)) {
        return {
          'o': 'r',
          'v': b
        };
      }
      switch (typea) {
        case 'boolean':
          return {
            'o': 'r',
            'v': b
          };
        case 'number':
          return {
            'o': 'r',
            'v': b
          };
        case 'array':
          return {
            'o': 'r',
            'v': b
          };
        case 'object':
          return {
            'o': 'O',
            'v': this.object_diff(a, b, policy)
          };
        case 'string':
          diffs = this.dmp.diff_main(a, b);
          if (diffs.length > 2) {
            this.dmp.diff_cleanupEfficiency(diffs);
          }
          if (diffs.length > 0) {
            return {
              'o': 'd',
              'v': this.dmp.diff_toDelta(diffs)
            };
          }
      }
      return {};
    };

    jsondiff.prototype.apply_list_diff = function(s, diffs) {
      var deleted, dmp_diffs, dmp_patches, dmp_result, index, indexes, j, key, len, op, patched, ref, ref1, s_index, shift, x;
      patched = this.deepCopy(s);
      indexes = [];
      deleted = [];
      for (key in diffs) {
        if (!hasProp.call(diffs, key)) continue;
        indexes.push(key);
        indexes.sort();
      }
      for (j = 0, len = indexes.length; j < len; j++) {
        index = indexes[j];
        op = diffs[index];
        shift = ((function() {
          var k, len1, results;
          results = [];
          for (k = 0, len1 = deleted.length; k < len1; k++) {
            x = deleted[k];
            if (x <= index) {
              results.push(x);
            }
          }
          return results;
        })()).length;
        s_index = index - shift;
        switch (op['o']) {
          case '+':
            [].splice.apply(patched, [s_index, (s_index - 1) - s_index + 1].concat(ref = op['v'])), ref;
            break;
          case '-':
            [].splice.apply(patched, [s_index, s_index - s_index + 1].concat(ref1 = [])), ref1;
            deleted[deleted.length] = s_index;
            break;
          case 'r':
            patched[s_index] = op['v'];
            break;
          case 'I':
            patched[s_index] += op['v'];
            break;
          case 'L':
            patched[s_index] = this.apply_list_diff(patched[s_index], op['v']);
            break;
          case 'dL':
            patched[s_index] = this.apply_list_diff_dmp(patched[s_index], op['v']);
            break;
          case 'O':
            patched[s_index] = this.apply_object_diff(patched[s_index], op['v']);
            break;
          case 'd':
            dmp_diffs = this.dmp.diff_fromDelta(patched[s_index], op['v']);
            dmp_patches = this.dmp.patch_make(patched[s_index], dmp_diffs);
            dmp_result = this.dmp.patch_apply(dmp_patches, patched[s_index]);
            patched[s_index] = dmp_result[0];
        }
      }
      return patched;
    };

    jsondiff.prototype.apply_list_diff_dmp = function(s, delta) {
      var dmp_diffs, dmp_patches, dmp_result, ptext;
      ptext = this._serialize_to_text(s);
      dmp_diffs = this.dmp.diff_fromDelta(ptext, delta);
      dmp_patches = this.dmp.patch_make(ptext, dmp_diffs);
      dmp_result = this.dmp.patch_apply(dmp_patches, ptext);
      return this._text_to_array(dmp_result[0]);
    };

    jsondiff.prototype.apply_object_diff = function(s, diffs) {
      var key, op, patched;
      patched = this.deepCopy(s);
      for (key in diffs) {
        if (!hasProp.call(diffs, key)) continue;
        op = diffs[key];
        if (op['o'] === '-') {
          delete patched[key];
        } else {
          patched[key] = this.apply_diff(patched[key], op);
        }
      }
      return patched;
    };

    jsondiff.prototype.apply_object_diff_with_offsets = function(s, diffs, field, offsets) {
      var dmp_diffs, dmp_patches, dmp_result, key, op, patched;
      patched = this.deepCopy(s);
      for (key in diffs) {
        if (!hasProp.call(diffs, key)) continue;
        op = diffs[key];
        switch (op['o']) {
          case '+':
            patched[key] = op['v'];
            break;
          case '-':
            delete patched[key];
            break;
          case 'r':
            patched[key] = op['v'];
            break;
          case 'I':
            patched[key] += op['v'];
            break;
          case 'L':
            patched[key] = this.apply_list_diff(patched[key], op['v']);
            break;
          case 'O':
            patched[key] = this.apply_object_diff(patched[key], op['v']);
            break;
          case 'd':
            dmp_diffs = this.dmp.diff_fromDelta(patched[key], op['v']);
            dmp_patches = this.dmp.patch_make(patched[key], dmp_diffs);
            if (key === field) {
              patched[key] = this.patch_apply_with_offsets(dmp_patches, patched[key], offsets);
            } else {
              dmp_result = this.dmp.patch_apply(dmp_patches, patched[key]);
              patched[key] = dmp_result[0];
            }
        }
      }
      return patched;
    };

    jsondiff.prototype.apply_diff = function(a, op) {
      var dmp_diffs, dmp_patches, dmp_result;
      switch (op['o']) {
        case '+':
          return op['v'];
        case '-':
          return null;
        case 'r':
          return op['v'];
        case 'I':
          return a + op['v'];
        case 'L':
          return this.apply_list_diff(a, op['v']);
        case 'dL':
          return this.apply_list_diff_dmp(a, op['v']);
        case 'O':
          return this.apply_object_diff(a, op['v']);
        case 'd':
          dmp_diffs = this.dmp.diff_fromDelta(a, op['v']);
          dmp_patches = this.dmp.patch_make(a, dmp_diffs);
          dmp_result = this.dmp.patch_apply(dmp_patches, a);
          return dmp_result[0];
      }
    };

    jsondiff.prototype.transform_list_diff = function(ad, bd, s, policy) {
      var ad_new, b_deletes, b_inserts, diff, index, last_index, last_shift, op, other_op, shift_l, shift_r, sindex, target_op, x;
      ad_new = {};
      b_inserts = [];
      b_deletes = [];
      if ((policy != null) && 'item' in policy) {
        policy = policy['item'];
      } else {
        policy = null;
      }
      for (index in bd) {
        if (!hasProp.call(bd, index)) continue;
        op = bd[index];
        index = parseInt(index);
        if (op['o'] === '+') {
          b_inserts.push(index);
        }
        if (op['o'] === '-') {
          b_deletes.push(index);
        }
      }
      last_index = 0;
      last_shift = 0;
      for (index in ad) {
        if (!hasProp.call(ad, index)) continue;
        op = ad[index];
        index = parseInt(index);
        shift_r = ((function() {
          var j, len, results;
          results = [];
          for (j = 0, len = b_inserts.length; j < len; j++) {
            x = b_inserts[j];
            if (x < index) {
              results.push(x);
            }
          }
          return results;
        })()).length;
        shift_l = ((function() {
          var j, len, results;
          results = [];
          for (j = 0, len = b_deletes.length; j < len; j++) {
            x = b_deletes[j];
            if (x < index) {
              results.push(x);
            }
          }
          return results;
        })()).length;
        if (last_index + 1 === index) {
          index = index + last_shift;
        } else {
          index = index + shift_r - shift_l;
        }
        last_index = index;
        last_shift = shift_r - shift_l;
        sindex = String(index);
        ad_new[sindex] = op;
        if (sindex in bd) {
          if (op['o'] === '+' && bd[index]['o'] === '+') {
            continue;
          } else if (op['o'] === '-') {
            if (bd[index]['o'] === '-') {
              delete ad_new[sindex];
            }
          } else if (bd[index]['o'] === '-') {
            if (op['o'] === 'r') {
              ad_new[sindex] = {
                'o': '+',
                'v': op['v']
              };
            }
            if (op['o'] === !'+') {
              ad_new[sindex] = {
                'o': '+',
                'v': this.apply_object_diff(s[sindex], op['v'])
              };
            }
          } else {
            target_op = {};
            target_op[sindex] = op;
            other_op = {};
            other_op[sindex] = bd[index];
            diff = this.transform_object_diff(target_op, other_op, s, policy);
            ad_new[sindex] = diff[sindex];
          }
        }
      }
      return ad_new;
    };

    jsondiff.prototype.transform_list_diff_dmp = function(ad, bd, s, policy) {
      var a_patches, ab_text, b_patches, b_text, dmp_diffs, stext;
      stext = this._serialize_to_text(s);
      a_patches = this.dmp.patch_make(stext, this.dmp.diff_fromDelta(stext, ad));
      b_patches = this.dmp.patch_make(stext, this.dmp.diff_fromDelta(stext, bd));
      b_text = (this.dmp.patch_apply(b_patches, stext))[0];
      ab_text = (this.dmp.patch_apply(a_patches, b_text))[0];
      if (ab_text !== b_text) {
        dmp_diffs = this.dmp.diff_lineMode_(b_text, ab_text);
        if (dmp_diffs.length > 2) {
          this.dmp.diff_cleanupEfficiency(dmp_diffs);
        }
        if (dmp_diffs.length > 0) {
          return this.dmp.diff_toDelta(dmp_diffs);
        }
      }
      return "";
    };

    jsondiff.prototype.transform_object_diff = function(ad, bd, s, policy) {
      var a_patches, ab_text, ad_new, aop, b_patches, b_text, bop, dmp_diffs, key, ref, sk;
      ad_new = this.deepCopy(ad);
      if ((policy != null) && 'attributes' in policy) {
        policy = policy['attributes'];
      }
      for (key in ad) {
        if (!hasProp.call(ad, key)) continue;
        aop = ad[key];
        if (!(key in bd)) {
          continue;
        }
        if ((policy != null) && 'attributes' in policy) {
          policy = policy['attributes'];
          if ((policy != null) && key in policy) {
            policy = policy[key];
          } else {
            policy = null;
          }
        } else {
          policy = null;
        }
        sk = s[key];
        bop = bd[key];
        if (aop['o'] === '+' && bop['o'] === '+') {
          if (this.equals(aop['v'], bop['v'])) {
            delete ad_new[key];
          } else {
            ad_new[key] = this.diff(bop['v'], aop['v'], policy);
          }
        } else if (aop['o'] === '-' && bop['o'] === '-') {
          delete ad_new[key];
        } else if (bop['o'] === '-' && ((ref = aop['o']) !== '+' && ref !== '-')) {
          ad_new[key] = {
            'o': '+'
          };
          ad_new[key]['v'] = this.apply_diff(sk, aop);
        } else if (aop['o'] === 'O' && bop['o'] === 'O') {
          ad_new[key] = {
            'o': 'O',
            'v': this.transform_object_diff(aop['v'], bop['v'], sk, policy)
          };
        } else if (aop['o'] === 'L' && bop['o'] === 'L') {
          ad_new[key] = {
            'o': 'L',
            'v': this.transform_list_diff(aop['v'], bop['v'], sk, policy)
          };
        } else if (aop['o'] === 'dL' && bop['o'] === 'dL') {
          ad_new[key] = {
            'o': 'dL',
            'v': this.transform_list_diff_dmp(aop['v'], bop['v'], sk, policy)
          };
        } else if (aop['o'] === 'd' && bop['o'] === 'd') {
          delete ad_new[key];
          a_patches = this.dmp.patch_make(sk, this.dmp.diff_fromDelta(sk, aop['v']));
          b_patches = this.dmp.patch_make(sk, this.dmp.diff_fromDelta(sk, bop['v']));
          b_text = (this.dmp.patch_apply(b_patches, sk))[0];
          ab_text = (this.dmp.patch_apply(a_patches, b_text))[0];
          if (ab_text !== b_text) {
            dmp_diffs = this.dmp.diff_main(b_text, ab_text);
            if (dmp_diffs.length > 2) {
              this.dmp.diff_cleanupEfficiency(dmp_diffs);
            }
            if (dmp_diffs.length > 0) {
              ad_new[key] = {
                'o': 'd',
                'v': this.dmp.diff_toDelta(dmp_diffs)
              };
            }
          }
        }
        return ad_new;
      }
    };

    jsondiff.prototype.patch_apply_with_offsets = function(patches, text, offsets) {
      var del_end, del_start, delta, diffs, end_loc, expected_loc, i, index1, index2, j, k, l, m, mod, nullPadding, ref, ref1, ref2, ref3, start_loc, text1, text2, x, y;
      if (patches.length === 0) {
        return text;
      }
      patches = this.dmp.patch_deepCopy(patches);
      nullPadding = this.dmp.patch_addPadding(patches);
      text = nullPadding + text + nullPadding;
      this.dmp.patch_splitMax(patches);
      delta = 0;
      for (x = j = 0, ref = patches.length; 0 <= ref ? j < ref : j > ref; x = 0 <= ref ? ++j : --j) {
        expected_loc = patches[x].start2 + delta;
        text1 = this.dmp.diff_text1(patches[x].diffs);
        end_loc = -1;
        if (text1.length > this.dmp.Match_MaxBits) {
          start_loc = this.dmp.match_main(text, text1.substring(0, this.dmp.Match_MaxBits), expected_loc);
          if (start_loc !== -1) {
            end_loc = this.dmp.match_main(text, text1.substring(text1.length - this.dmp.Match_MaxBits), expected_loc + text1.length - this.dmp.Match_MaxBits);
            if (end_loc === -1 || start_loc >= end_loc) {
              start_loc = -1;
            }
          }
        } else {
          start_loc = this.dmp.match_main(text, text1, expected_loc);
        }
        if (start_loc === -1) {
          delta -= patches[x].length2 - patches[x].length1;
        } else {
          delta = start_loc - expected_loc;
          if (end_loc === -1) {
            text2 = text.substring(start_loc, start_loc + text1.length);
          } else {
            text2 = text.substring(start_loc, end_loc + this.dmp.Match_MaxBits);
          }
          diffs = this.dmp.diff_main(text1, text2, false);
          if (text1.length > this.dmp.Match_MaxBits && this.dmp.diff_levenshtein(diffs) / text1.length > this.dmp.Patch_DeleteThreshold) {

          } else {
            index1 = 0;
            for (y = k = 0, ref1 = patches[x].diffs.length; 0 <= ref1 ? k < ref1 : k > ref1; y = 0 <= ref1 ? ++k : --k) {
              mod = patches[x].diffs[y];
              if (mod[0] !== DIFF_EQUAL) {
                index2 = this.dmp.diff_xIndex(diffs, index1);
              }
              if (mod[0] === DIFF_INSERT) {
                text = text.substring(0, start_loc + index2) + mod[1] + text.substring(start_loc + index2);
                for (i = l = 0, ref2 = offsets.length; 0 <= ref2 ? l < ref2 : l > ref2; i = 0 <= ref2 ? ++l : --l) {
                  if (offsets[i] + nullPadding.length > start_loc + index2) {
                    offsets[i] += mod[1].length;
                  }
                }
              } else if (mod[0] === DIFF_DELETE) {
                del_start = start_loc + index2;
                del_end = start_loc + this.dmp.diff_xIndex(diffs, index1 + mod[1].length);
                text = text.substring(0, del_start) + text.substring(del_end);
                for (i = m = 0, ref3 = offsets.length; 0 <= ref3 ? m < ref3 : m > ref3; i = 0 <= ref3 ? ++m : --m) {
                  if (offsets[i] + nullPadding.length > del_start) {
                    if (offsets[i] + nullPadding.length < del_end) {
                      offsets[i] = del_start - nullPadding.length;
                    } else {
                      offsets[i] -= del_end - del_start;
                    }
                  }
                }
              }
              if (mod[0] !== DIFF_DELETE) {
                index1 += mod[1].length;
              }
            }
          }
        }
      }
      text = text.substring(nullPadding.length, text.length - nullPadding.length);
      return text;
    };

    return jsondiff;

  })();

  module['exports'] = jsondiff;

}).call(this);
