import {
    constructObjectWithPath,
    deconstructObjectWithPath,
    FieldTransforms,
    isArray,
    isObject,
    isString,
    symbolDelete,
    TypeAtPath,
} from '@legendapp/state';

let validateMap: (map: Record<string, any>) => void;

export function transformPath(path: string[], map: Record<string, any>): string[] {
    const data: Record<string, any> = {};
    let d = data;
    for (let i = 0; i < path.length; i++) {
        d = d[path[i]] = i === path.length - 1 ? null : {};
    }
    let value = transformObject(data, map);
    const pathOut = [];
    for (let i = 0; i < path.length; i++) {
        const key = Object.keys(value)[0];
        pathOut.push(key);
        value = value[key];
    }
    return pathOut;
}

export function transformObject(dataIn: Record<string, any>, map: Record<string, any>) {
    if (process.env.NODE_ENV === 'development') {
        validateMap(map);
    }
    // Note: If changing this, change it in IndexedDB preloader
    let ret = dataIn;
    if (dataIn) {
        if ((dataIn as unknown) === symbolDelete) return dataIn;

        ret = {};

        const dict = Object.keys(map).length === 1 && map['_dict'];

        Object.keys(dataIn).forEach((key) => {
            if (ret[key] !== undefined) return;

            let v = dataIn[key];

            if (dict) {
                ret[key] = transformObject(v, dict);
            } else {
                const mapped = map[key];
                if (mapped === undefined) {
                    // Don't transform dateModified if user doesn't want it
                    if (key !== '@') {
                        ret[key] = v;
                        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
                            console.error('A fatal field transformation error has occurred', key, dataIn, map);
                        }
                    }
                } else if (mapped !== null) {
                    if (v !== undefined && v !== null) {
                        if (map[key + '_val']) {
                            const valMap = map[key + '_val'];
                            v = valMap[key];
                        } else if (map[key + '_arr'] && isArray(v)) {
                            const mapChild = map[key + '_arr'];
                            v = v.map((vChild) => transformObject(vChild, mapChild));
                        } else if (isObject(v)) {
                            if (map[key + '_obj']) {
                                v = transformObject(v, map[key + '_obj']);
                            } else if (map[key + '_dict']) {
                                const mapChild = map[key + '_dict'];
                                let out = {};
                                Object.keys(v).forEach((keyChild) => {
                                    out[keyChild] = transformObject(v[keyChild], mapChild);
                                });
                                v = out;
                            }
                        }
                    }
                    ret[mapped] = v;
                }
            }
            if (process.env.NODE_ENV === 'development' && ret['[object Object]']) debugger;
        });
    }

    if (process.env.NODE_ENV === 'development' && ret && ret['[object Object]']) debugger;

    return ret;
}

export function transformObjectWithPath(
    obj: object,
    path: (string | number)[],
    pathTypes: TypeAtPath[],
    fieldTransforms: FieldTransforms<any>
) {
    let constructed = constructObjectWithPath(path, obj, pathTypes);
    const transformed = transformObject(constructed, fieldTransforms);
    const transformedPath = transformPath(path as string[], fieldTransforms);
    return { path: transformedPath, obj: deconstructObjectWithPath(transformedPath, transformed) };
}

const invertedMaps = new WeakMap();

export function invertFieldMap(obj: Record<string, any>) {
    // Note: If changing this, change it in IndexedDB preloader
    const existing = invertedMaps.get(obj);
    if (existing) return existing;

    const target: Record<string, any> = {} as any;

    Object.keys(obj).forEach((key) => {
        const val = obj[key];
        if (process.env.NODE_ENV === 'development' && target[val]) debugger;
        if (key === '_dict') {
            target[key] = invertFieldMap(val);
        } else if (key.endsWith('_obj') || key.endsWith('_dict') || key.endsWith('_arr')) {
            const keyMapped = obj[key.replace(/_obj|_dict|_arr$/, '')];
            const suffix = key.match(/_obj|_dict|_arr$/)[0];
            target[keyMapped + suffix] = invertFieldMap(val);
        } else if (typeof val === 'string') {
            target[val] = key;
        }
    });
    if (process.env.NODE_ENV === 'development' && target['[object Object]']) debugger;
    invertedMaps.set(obj, target);

    return target;
}

if (process.env.NODE_ENV === 'development') {
    validateMap = function (record: Record<string, any>) {
        const values = Object.values(record).filter((value) => {
            if (isObject(value)) {
                validateMap(value);
            } else {
                return isString(value);
            }
        });

        const uniques = Array.from(new Set(values));
        if (values.length !== uniques.length) {
            console.error('Field transform map has duplicate values', record, values.length, uniques.length);
            debugger;
        }
        return record;
    };
}
