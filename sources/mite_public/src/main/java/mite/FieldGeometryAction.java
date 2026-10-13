package mite;

import com.google.common.base.Throwables;
import lsfusion.interop.action.MessageClientAction;
import lsfusion.server.data.sql.exception.SQLHandledException;
import lsfusion.server.data.value.DataObject;
import lsfusion.server.language.ScriptingLogicsModule;
import lsfusion.server.logics.action.controller.context.ExecutionContext;
import lsfusion.server.logics.classes.ValueClass;
import lsfusion.server.logics.property.classes.ClassPropertyInterface;
import lsfusion.server.physics.dev.integration.internal.to.InternalAction;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/**
 * Кодфикс 09.10, КФ-3: геометрия поля из GeoJSON-полигона.
 *
 * Считает площадь (га) и центроид контура, пишет centerLat/centerLon;
 * areaHa — только когда площадь не «вручную» (areaManual). Площадь —
 * формула шнурования в равнопромежуточной проекции относительно центроида
 * (поля единицы км — погрешность пренебрежима); центроид — по формуле
 * площадного взвешивания, а не среднее вершин.
 *
 * Параметры — паттерн LagrangeAction/KMeansZoneAction: объект Field один.
 */
public class FieldGeometryAction extends InternalAction {

    private final ClassPropertyInterface fieldInterface;

    public FieldGeometryAction(ScriptingLogicsModule LM, ValueClass... classes) {
        super(LM, classes);
        fieldInterface = getOrderInterfaces().get(0);
    }

    @Override
    protected void executeInternal(ExecutionContext<ClassPropertyInterface> ctx) throws SQLException, SQLHandledException {
        DataObject field = ctx.getDataKeyValue(fieldInterface);
        if (field == null) return;

        try {
            Object geoRaw = findProperty("boundaryGeoJson[Field]").read(ctx, field);
            if (geoRaw == null) return;
            String geo;
            if (geoRaw instanceof byte[]) geo = new String((byte[]) geoRaw, "UTF-8");
            else geo = String.valueOf(geoRaw);
            double[][] ring = parseFirstRing(geo);
            if (ring.length < 3) {
                ctx.requestUserInteraction(new MessageClientAction(
                        "Поле: контур не распознан (" + ring.length + " точек; тип="
                                + geoRaw.getClass().getSimpleName() + ", длина=" + geo.length() + ")", "Геометрия"));
                return;
            }

            double[] centroid = ringCentroid(ring);           // {lon, lat}
            double areaSqm = sphericalArea(ring, centroid[1]); // м²

            findProperty("centerLon[Field]").change(round(centroid[0], 8), ctx, field);
            findProperty("centerLat[Field]").change(round(centroid[1], 8), ctx, field);
            findProperty("geoAreaSqm[Field]").change(round(areaSqm, 2), ctx, field);

            Object manual = findProperty("areaManual[Field]").read(ctx, field);
            if (!Boolean.TRUE.equals(manual)) {
                findProperty("areaHa[Field]").change(round(areaSqm / 10000.0, 2), ctx, field);
            }
        } catch (Throwable e) {
            ctx.requestUserInteraction(new MessageClientAction("Геометрия поля: " + e.getMessage(), "Ошибка"));
            throw Throwables.propagate(e);
        }
    }

    /** Первый контур Polygon: [[lon,lat],...] — ручной разбор без JSON-библиотек.
     *  Пара закрывается ТОЛЬКО ']' — запятая внутри пары не расщепляет её. */
    static double[][] parseFirstRing(String geo) {
        List<double[]> pts = new ArrayList<>();
        int i = geo.indexOf("\"coordinates\"");
        if (i < 0) return new double[0][0];
        int depth = 0, start = -1;
        for (int p = i; p < geo.length(); p++) {
            char c = geo.charAt(p);
            if (c == '[') {
                depth++;
                if (depth == 3) start = p + 1;
            } else if (c == ']') {
                if (depth == 3 && start >= 0) {
                    addPair(pts, geo.substring(start, p));
                    start = -1;
                }
                if (depth == 2) break;
                depth--;
            }
        }
        // замыкание: первая==последняя точка — дубль отбрасываем
        if (pts.size() > 1) {
            double[] a = pts.get(0), b = pts.get(pts.size() - 1);
            if (Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12) pts.remove(pts.size() - 1);
        }
        return pts.toArray(new double[0][]);
    }

    private static void addPair(List<double[]> pts, String s) {
        int sep = s.indexOf(',');
        if (sep < 0) return;
        try {
            pts.add(new double[]{Double.parseDouble(s.substring(0, sep).trim()),
                    Double.parseDouble(s.substring(sep + 1).trim())});
        } catch (NumberFormatException ignored) { }
    }

    /** Центроид полигона (площадное взвешивание) в координатах lon/lat. */
    static double[] ringCentroid(double[][] r) {
        double cx = 0, cy = 0, a = 0;
        for (int i = 0; i < r.length; i++) {
            double[] p = r[i], q = r[(i + 1) % r.length];
            double cross = p[0] * q[1] - q[0] * p[1];
            a += cross;
            cx += (p[0] + q[0]) * cross;
            cy += (p[1] + q[1]) * cross;
        }
        if (Math.abs(a) < 1e-18) {   // вырожденный: среднее вершин
            for (double[] p : r) { cx += p[0]; cy += p[1]; }
            return new double[]{cx / r.length, cy / r.length};
        }
        a *= 0.5;
        return new double[]{cx / (6 * a), cy / (6 * a)};
    }

    /** Площадь (м²): шнурование в проекции вокруг широты центроида.
     *  lat0Deg — ГРАДУСЫ (баг-урок: cos от градусов-как-радиан занижал
     *  площадь в ~7 раз). */
    static double sphericalArea(double[][] r, double lat0Deg) {
        final double R = 6378137.0; // WGS84
        double cosLat = Math.cos(Math.toRadians(lat0Deg));
        double s = 0;
        for (int i = 0; i < r.length; i++) {
            double[] p = r[i], q = r[(i + 1) % r.length];
            s += Math.toRadians(p[0]) * cosLat * Math.toRadians(q[1])
                    - Math.toRadians(q[0]) * cosLat * Math.toRadians(p[1]);
        }
        return Math.abs(s * 0.5) * R * R;
    }

    private static double round(double v, int digits) {
        double m = Math.pow(10, digits);
        return Math.round(v * m) / m;
    }
}
