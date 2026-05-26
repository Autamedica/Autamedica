"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { JSX } from "react";

export interface WaffleCategory {
  id: string;
  label: string;
  value: number;
  percentage: number; // 0 - 100
  colorClass: string; // Ej: 'bg-violet-500'
  bgLightClass: string; // Ej: 'bg-violet-50'
  textClass: string;  // Ej: 'text-violet-600'
}

interface WaffleChartProps {
  title: string;
  subtitle: string;
  icon?: React.ComponentType<{ className?: string }>;
  data: WaffleCategory[];
}

export function WaffleChart({
  title,
  subtitle,
  icon: Icon,
  data,
}: WaffleChartProps): JSX.Element {
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);

  // Generamos un array plano de 100 elementos representando cada celda (1%)
  const gridCells = useMemo(() => {
    const cells: { categoryId: string; colorClass: string }[] = [];
    
    // Distribuimos los porcentajes asegurando que sumen exactamente 100
    // Usamos redondeo básico pero ajustado para que no exceda ni falte
    let totalCellsAllocated = 0;
    const allocations = data.map((cat, idx) => {
      let rounded = Math.round(cat.percentage);
      // Ajuste para el último elemento si la suma de redondeos no da exactamente 100
      if (idx === data.length - 1) {
        rounded = 100 - totalCellsAllocated;
      }
      totalCellsAllocated += rounded;
      return { id: cat.id, count: rounded, colorClass: cat.colorClass };
    });

    allocations.forEach((alloc) => {
      for (let i = 0; i < alloc.count; i++) {
        cells.push({
          categoryId: alloc.id,
          colorClass: alloc.colorClass,
        });
      }
    });

    // En caso de desbordes o inconsistencias extrañas, rellenamos o recortamos a 100
    while (cells.length < 100) {
      cells.push({
        categoryId: data[data.length - 1]?.id || "unknown",
        colorClass: data[data.length - 1]?.colorClass || "bg-neutral-300",
      });
    }
    return cells.slice(0, 100);
  }, [data]);

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white p-6 transition-all hover:shadow-md">
      {/* ── Header del Gráfico ── */}
      <div className="mb-6 flex items-start gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900">
            {title}
          </h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[180px_1fr] lg:grid-cols-[200px_1fr] items-center">
        {/* ── Grid del Waffle (10x10) ── */}
        <div className="mx-auto w-full max-w-[180px] aspect-square">
          <div className="grid grid-cols-10 grid-rows-10 gap-[3px] h-full w-full">
            {gridCells.map((cell, idx) => {
              const isDimmed =
                hoveredCategoryId !== null && cell.categoryId !== hoveredCategoryId;
              
              return (
                <motion.div
                  key={idx}
                  onMouseEnter={() => setHoveredCategoryId(cell.categoryId)}
                  onMouseLeave={() => setHoveredCategoryId(null)}
                  className={`w-full h-full rounded-[3px] transition-all duration-200 ${cell.colorClass} cursor-pointer`}
                  style={{
                    opacity: isDimmed ? 0.25 : 1,
                    scale: hoveredCategoryId === cell.categoryId ? 1.1 : 1,
                  }}
                  layoutId={`waffle-cell-${idx}`}
                />
              );
            })}
          </div>
        </div>

        {/* ── Leyendas y Estadísticas ── */}
        <div className="flex flex-col gap-2.5">
          {data.map((category) => {
            const isDimmed =
              hoveredCategoryId !== null && category.id !== hoveredCategoryId;

            return (
              <div
                key={category.id}
                onMouseEnter={() => setHoveredCategoryId(category.id)}
                onMouseLeave={() => setHoveredCategoryId(null)}
                className={`group flex items-center justify-between rounded-xl border border-neutral-100 p-3 transition-all cursor-pointer ${
                  hoveredCategoryId === category.id
                    ? "bg-neutral-50 border-neutral-300/80 shadow-sm"
                    : "bg-white hover:bg-neutral-50/50"
                }`}
                style={{
                  opacity: isDimmed ? 0.4 : 1,
                }}
              >
                <div className="flex items-center gap-3">
                  {/* Indicador de Color */}
                  <span
                    className={`h-3 w-3 shrink-0 rounded-full ${category.colorClass}`}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-neutral-800 truncate">
                      {category.label}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {Math.round(category.percentage)}% del total de pacientes
                    </p>
                  </div>
                </div>

                {/* Contador Absoluto */}
                <div className="text-right pl-3 shrink-0">
                  <span className={`text-[15px] font-semibold tracking-tight ${category.textClass}`}>
                    {category.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
