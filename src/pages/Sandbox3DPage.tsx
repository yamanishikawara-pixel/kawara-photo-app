import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
// ★ ThreeEventをimport typeで読み込むように修正
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { Vector3 } from 'three';
// ★ 使っていなかった Trash2 を削除
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function RoofModel() {
  const [pins, setPins] = useState<Vector3[]>([]);

  // 屋根（斜面）をタップしたときの処理
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation(); // 貫通して裏側にピンが打たれるのを防ぐ
    // タップした正確な3D座標(x, y, z)を取得してピンを追加！
    setPins([...pins, e.point]);
  };

  return (
    <group>
      {/* 簡易的な屋根（今回は分かりやすく四角錐＝寄棟屋根風） */}
      <mesh position={[0, 2, 0]} rotation={[0, Math.PI / 4, 0]} onPointerDown={handlePointerDown}>
        <coneGeometry args={[4, 3, 4]} />
        <meshStandardMaterial color="#8B4513" roughness={0.8} />
      </mesh>
      
      {/* 家の土台（壁） */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[5.5, 4, 5.5]} />
        <meshStandardMaterial color="#f3f4f6" />
      </mesh>

      {/* 打ち込まれたピン（赤い球体）を描画 */}
      {pins.map((pos, idx) => (
        <mesh key={idx} position={pos}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      ))}
    </group>
  );
}

export function Sandbox3DPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col font-sans select-none">
      {/* 実験室のヘッダー */}
      <div className="p-4 bg-gray-800 text-white flex items-center justify-between z-10 shadow-md">
         <button onClick={() => navigate('/')} className="flex items-center gap-2 text-blue-400 font-bold px-3 py-2 hover:bg-gray-700 rounded-lg transition-colors">
           <ArrowLeft className="w-5 h-5"/> 現場一覧へ戻る
         </button>
         <h1 className="text-xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">
           3D EXPERIMENT ROOM
         </h1>
         <div className="text-xs font-bold text-gray-400 hidden sm:block">
           スワイプ: 回転 / ピンチ: 拡大縮小 / タップ: ピン打ち
         </div>
      </div>
      
      {/* 3Dキャンバス空間 */}
      <div className="flex-1 w-full relative">
        <Canvas camera={{ position: [8, 8, 8], fov: 50 }}>
          {/* 太陽の光と環境光 */}
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          <Environment preset="city" />
          
          {/* 先ほど定義した屋根モデルを召喚 */}
          <RoofModel />
          
          {/* 指でグリグリ回せるようにする魔法のカメラコントローラー */}
          <OrbitControls makeDefault />
        </Canvas>

        {/* 画面下の操作説明（スマホ用） */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm font-bold pointer-events-none shadow-2xl border border-white/10">
          屋根をタップしてピンを打つ！
        </div>
      </div>
    </div>
  );
}