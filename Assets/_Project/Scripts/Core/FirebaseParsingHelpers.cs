using System;
using System.Collections.Generic;

namespace GuildsAndEmpires.Core
{
    internal static class FirebaseParsingHelpers
    {
        internal static Dictionary<object, object> RequireDict(object value, string fieldName)
        {
            if (value is Dictionary<object, object> dict) return dict;
            if (value is Dictionary<string, object> strDict)
            {
                var converted = new Dictionary<object, object>(strDict.Count);
                foreach (var kv in strDict) converted[kv.Key] = kv.Value;
                return converted;
            }
            throw new FormatException(
                $"Firebase: expected dict for '{fieldName}', got {value?.GetType().Name ?? "null"}");
        }

        internal static object GetValue(Dictionary<object, object> dict, string key)
        {
            dict.TryGetValue(key, out var val);
            return val;
        }

        internal static string GetString(Dictionary<object, object> d, string key, string fallback)
        {
            var v = GetValue(d, key);
            return v is string s ? s : fallback;
        }

        internal static long GetLong(Dictionary<object, object> d, string key, long fallback)
        {
            var v = GetValue(d, key);
            if (v == null) return fallback;
            try { return Convert.ToInt64(v); }
            catch { return fallback; }
        }
    }
}
