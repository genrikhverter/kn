import lsfusion.base.ExceptionUtils;
import lsfusion.server.data.sql.exception.SQLHandledException;
import lsfusion.server.data.value.DataObject;
import lsfusion.server.language.ScriptingErrorLog;
import lsfusion.server.language.ScriptingLogicsModule;
import lsfusion.server.language.property.LP;
import lsfusion.server.logics.action.controller.context.ExecutionContext;
import lsfusion.server.logics.classes.ValueClass;
import lsfusion.server.logics.property.classes.ClassPropertyInterface;
import lsfusion.server.physics.dev.integration.internal.to.InternalAction;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Геометрическая связка поле↔земельный участок (п.3 обзора 12.10): контур поля
 * пересекается с контуром участка → поле в его составе. Для УЧАСТКА-параметра
 * пишет в linkFieldPlotsResult плоскую строку «кодПоля,кодПоля,…,» — LSF
 * (relinkFieldPlotsAct) обходит её через LIKE и создаёт FieldPlot.
 * ⚠ вывод именно строкой, а не JSON: IMPORT-разбор в LSF тянул NEW внутрь
 * DO-контекста, где строки создавались без system__class (quirk 12.10(4)).
 */
public class LinkFieldPlotsAction extends InternalAction {

    private final ClassPropertyInterface plotInterface;

    public LinkFieldPlotsAction(ScriptingLogicsModule LM, ValueClass... classes) {
        super(LM, classes);
        java.util.Iterator<ClassPropertyInterface> i = interfaces.iterator();
        plotInterface = i.next();
    }

    public void executeInternal(ExecutionContext<ClassPropertyInterface> context) throws SQLException, SQLHandledException {
        try {
            DataObject plotObject = context.getDataKeyValue(plotInterface);
            Object rawKey = plotObject == null ? null : plotObject.getValue();
            String plotKey = rawKey == null ? null : rawKey.toString();

            Map<Object, String> fieldGeom = readAll(context, "boundaryGeoJson[Field]");
            Map<Object, String> fieldCode = readAll(context, "code[Field]");
            Map<Object, String> plotGeom = readAll(context, "polygonGeoJson[LandPlot]");

            // геометрия ИМЕННО этого участка — по ключу параметра действия
            List<List<double[]>> pRings = null;
            if (plotKey != null) {
                for (Map.Entry<Object, String> pe : plotGeom.entrySet()) {
                    if (plotKey.equals(keyOf(pe.getKey()))) {
                        pRings = rings(pe.getValue());
                        break;
                    }
                }
            }
            if (pRings != null) {
                LP<?> hit = findProperty("linkFieldPlotsHit[Field,LandPlot]");
                lsfusion.server.logics.classes.user.ConcreteObjectClass fieldClass = null;
                try { fieldClass = (lsfusion.server.logics.classes.user.ConcreteObjectClass) LM.getClass("Field"); }
                catch (Exception e) { fieldClass = (lsfusion.server.logics.classes.user.ConcreteObjectClass) LM.getClass("Ku.Field"); }
                lsfusion.server.logics.classes.user.ConcreteObjectClass plotClass = null;
                try { plotClass = (lsfusion.server.logics.classes.user.ConcreteObjectClass) LM.getClass("LandPlot"); }
                catch (Exception e) { plotClass = (lsfusion.server.logics.classes.user.ConcreteObjectClass) LM.getClass("Ku.LandPlot"); }
                for (Map.Entry<Object, String> fe : fieldGeom.entrySet()) {
                    List<List<double[]>> fRings = rings(fe.getValue());
                    if (fRings == null) continue;
                    if (intersects(fRings, pRings)) {
                        try {
                            hit.change(true, context,
                                    new DataObject(Long.valueOf(keyOf(fe.getKey())), fieldClass),
                                    new DataObject(Long.valueOf(plotKey), plotClass));
                        } catch (Exception e) { /* пара пропускается */ }
                    }
                }
            }
        } catch (Exception e) {
            throw ExceptionUtils.propagate(e, SQLException.class, SQLHandledException.class);
        }
    }

    private static String keyOf(Object k) {
        if (k instanceof DataObject) return String.valueOf(((DataObject) k).getValue());
        return String.valueOf(k);
    }

    /** все значения свойства одного параметра: ключ объекта → значение */
    private Map<Object, String> readAll(ExecutionContext<ClassPropertyInterface> context, String name)
            throws SQLException, SQLHandledException, ScriptingErrorLog.SemanticErrorException {
        LP<?> lp = findProperty(name);
        Map<Object, String> out = new LinkedHashMap<>();
        for (Map.Entry<lsfusion.base.col.interfaces.immutable.ImList<Object>, Object> e
                : lp.readAll(context).toJavaMap().entrySet()) {
            Object key = e.getKey().get(0);
            Object val = e.getValue();
            out.put(key instanceof DataObject ? ((DataObject) key).getValue() : key,
                    val == null ? null : val.toString());
        }
        return out;
    }

    // ---------- GeoJSON → список внешних колец (lon, lat) ----------

    private static List<List<double[]>> rings(String geojson) {
        try {
            JsonObject obj = JsonParser.parseString(geojson).getAsJsonObject();
            String type = obj.get("type").getAsString();
            JsonArray coords = obj.get("coordinates").getAsJsonArray();
            List<List<double[]>> res = new ArrayList<>();
            if ("Polygon".equals(type)) {
                res.add(ring(coords.get(0).getAsJsonArray()));
            } else if ("MultiPolygon".equals(type)) {
                for (JsonElement poly : coords)
                    res.add(ring(((JsonArray) poly).get(0).getAsJsonArray()));
            }
            return res.isEmpty() ? null : res;
        } catch (Exception e) {
            return null;
        }
    }

    private static List<double[]> ring(JsonArray arr) {
        List<double[]> pts = new ArrayList<>(arr.size());
        for (JsonElement el : arr) {
            JsonArray c = el.getAsJsonArray();
            pts.add(new double[]{c.get(0).getAsDouble(), c.get(1).getAsDouble()});
        }
        return pts;
    }

    // ---------- пересечение полигонов: вершина внутри / пересечение рёбер ----------

    private static boolean intersects(List<List<double[]>> a, List<List<double[]>> b) {
        for (List<double[]> ra : a) {
            for (double[] p : ra)
                for (List<double[]> rb : b)
                    if (pointInRing(p, rb)) return true;
            for (List<double[]> rb : b)
                if (edgesIntersect(ra, rb)) return true;
        }
        for (List<double[]> rb : b)
            for (double[] p : rb)
                for (List<double[]> ra : a)
                    if (pointInRing(p, ra)) return true;
        return false;
    }

    private static boolean pointInRing(double[] pt, List<double[]> ring) {
        boolean inside = false;
        int n = ring.size();
        for (int i = 0, j = n - 1; i < n; j = i++) {
            double[] a = ring.get(i), b = ring.get(j);
            if ((a[1] > pt[1]) != (b[1] > pt[1])
                    && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0])
                inside = !inside;
        }
        return inside;
    }

    private static boolean edgesIntersect(List<double[]> r1, List<double[]> r2) {
        for (int i = 0; i < r1.size() - 1; i++) {
            double[] a = r1.get(i), b = r1.get(i + 1);
            for (int j = 0; j < r2.size() - 1; j++) {
                double[] c = r2.get(j), d = r2.get(j + 1);
                if (segsIntersect(a, b, c, d)) return true;
            }
        }
        return false;
    }

    private static boolean segsIntersect(double[] a, double[] b, double[] c, double[] d) {
        double d1 = cross(c, d, a), d2 = cross(c, d, b);
        double d3 = cross(a, b, c), d4 = cross(a, b, d);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }

    private static double cross(double[] o, double[] a, double[] b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }
}
