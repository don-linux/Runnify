import Image from "next/image";
import type { DayPeriod } from "@/lib/run-window";

/**
 * Field: Landscape-agriculture.svg, CC0, Wikimedia Commons.
 * Sun: Weather icon - sunny.svg, CC0, Wikimedia Commons.
 * Moon: Moon symbol decrescent.svg, public domain, Wikimedia Commons.
 */
export function DayScene({ period }: { period: DayPeriod }) {
  const night = period === "night";

  return (
    <div className={`day-scene day-${period}`} aria-hidden="true">
      <div className="day-scene-sky" />
      {night ? (
        <svg className="day-scene-stars" viewBox="0 0 1200 700">
          <circle cx="120" cy="80" r="1.6" />
          <circle cx="260" cy="140" r="1.2" />
          <circle cx="420" cy="60" r="1.8" />
          <circle cx="560" cy="170" r="1.1" />
          <circle cx="740" cy="90" r="1.5" />
          <circle cx="900" cy="150" r="1.3" />
          <circle cx="1040" cy="70" r="1.7" />
          <circle cx="180" cy="230" r="1.1" />
          <circle cx="980" cy="240" r="1.2" />
        </svg>
      ) : null}
      <Image
        className={night ? "day-scene-moon" : `day-scene-sun day-scene-sun-${period}`}
        src={night ? "/scenes/moon.svg" : "/scenes/sun.svg"}
        alt=""
        width={148}
        height={148}
      />
      <div className="day-scene-field">
        <Image src="/scenes/field.svg" alt="" width={3840} height={1080} />
      </div>
    </div>
  );
}
